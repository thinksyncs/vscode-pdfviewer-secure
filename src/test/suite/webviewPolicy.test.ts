import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import {
  PREVIEW_FEATURE_DEFAULTS,
  PREVIEW_RUNTIME_VALUES,
  PreviewFeatures,
  PreviewWebviewSettings,
} from '../../config';

class MockElement {
  readonly attributes = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly classList = {
    contains: (name: string): boolean => this.classes.has(name),
    remove: (name: string): void => {
      this.classes.delete(name);
    },
  };
  parentElement: MockElement | null = null;
  nextElementSibling: MockElement | null = null;
  hidden = false;
  disabled = false;
  innerText = '';

  constructor(readonly id = '') {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  closest(selectors: string): MockElement | null {
    for (const selector of selectors.split(',').map((item) => item.trim())) {
      if (
        (selector === 'a[href]' &&
          this instanceof MockAnchor &&
          this.attributes.has('href')) ||
        (selector.startsWith('#') && this.id === selector.slice(1)) ||
        (selector.startsWith('.') && this.classes.has(selector.slice(1)))
      ) {
        return this;
      }
    }
    return this.parentElement?.closest(selectors) ?? null;
  }
}

class MockButton extends MockElement {}
class MockInput extends MockElement {}
class MockSelect extends MockElement {}
class MockAnchor extends MockElement {
  get href(): string {
    return this.getAttribute('href') ?? '';
  }

  set href(value: string) {
    this.setAttribute('href', value);
  }
}

interface MockTransfer {
  items: { kind: string; type: string }[];
  files: { type: string; name: string }[];
  dropEffect: string;
}

class MockEvent {
  defaultPrevented = false;
  stopped = false;
  target: MockElement | null = null;
  data: unknown;
  detail: unknown;
  dataTransfer: MockTransfer | null = null;
  key = '';
  ctrlKey = false;
  metaKey = false;
  altKey = false;

  constructor(init: Partial<MockEvent> = {}) {
    Object.assign(this, init);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopImmediatePropagation(): void {
    this.stopped = true;
  }
}

type Listener = (event: MockEvent) => unknown;

class MockEventTarget {
  private readonly listeners = new Map<
    string,
    { callback: Listener; once: boolean }[]
  >();

  addEventListener(
    name: string,
    callback: Listener,
    options?: boolean | { once?: boolean },
  ): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push({
      callback,
      once: typeof options === 'object' && options.once === true,
    });
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, callback: Listener): void {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter(
        (listener) => listener.callback !== callback,
      ),
    );
  }

  async emit(name: string, init: Partial<MockEvent> = {}): Promise<MockEvent> {
    const event = new MockEvent(init);
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      if (listener.once) {
        const listeners = this.listeners.get(name) ?? [];
        listeners.splice(listeners.indexOf(listener), 1);
      }
      await listener.callback(event);
      if (event.stopped) {
        break;
      }
    }
    return event;
  }
}

class MockEventBus {
  readonly dispatched: string[] = [];
  private readonly listeners = new Map<
    string,
    Set<(event?: unknown) => void>
  >();

  on(name: string, callback: (event?: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(callback);
    this.listeners.set(name, listeners);
  }

  off(name: string, callback: (event?: unknown) => void): void {
    this.listeners.get(name)?.delete(callback);
  }

  dispatch(name: string, data?: unknown): void {
    this.dispatched.push(name);
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      listener(data);
    }
  }
}

interface HarnessOptions {
  features?: Partial<PreviewFeatures>;
  renderPage?: boolean;
  initializeAfterLoaded?: boolean;
  parentDocument?: 'accessible' | 'cross-origin';
  foreignStartupEvent?: boolean;
  initializationError?: unknown;
  openFailures?: Record<number, unknown>;
  workerFetchStatus?: number;
  workerFetchError?: unknown;
  workerConstructorError?: unknown;
}

async function createHarness(options: HarnessOptions = {}) {
  const config: PreviewWebviewSettings = {
    cMapUrl: 'https://assets.invalid/cmaps/',
    iccUrl: 'https://assets.invalid/iccs/',
    imageResourcesPath: 'https://assets.invalid/images/',
    runtime: PREVIEW_RUNTIME_VALUES,
    sandboxBundleSrc: 'https://assets.invalid/pdf.sandbox.mjs',
    standardFontDataUrl: 'https://assets.invalid/fonts/',
    wasmUrl: 'https://assets.invalid/wasm/',
    workerSrc: 'https://assets.invalid/pdf.worker.mjs',
    path: 'https://assets.invalid/document.pdf',
    features: { ...PREVIEW_FEATURE_DEFAULTS, ...options.features },
    defaults: {
      cursor: 'select',
      scale: 'auto',
      scrollMode: 'vertical',
      spreadMode: 'none',
      sidebar: false,
    },
  };
  const elements = new Map<string, MockElement>();
  for (const id of [
    'secondaryOpenFile',
    'viewsManagerAddFileButton',
    'editorModeButtons',
    'editorModeSeparator',
    'viewBookmark',
    'viewBookmarkSeparator',
    'documentProperties',
    'printButton',
    'secondaryPrint',
    'downloadButton',
    'secondaryDownload',
    'viewsManagerStatusActionSaveAs',
  ]) {
    elements.set(id, new MockButton(id));
  }
  const configElement = new MockElement('pdf-preview-config');
  configElement.setAttribute('data-config', JSON.stringify(config));
  elements.set(configElement.id, configElement);
  const document = Object.assign(new MockEventTarget(), {
    getElementById: (id: string): MockElement | null =>
      elements.get(id) ?? null,
    createElement: (): MockElement => new MockElement(),
    body: new MockElement(),
  });
  const startupTarget =
    options.parentDocument === 'accessible' ? new MockEventTarget() : document;
  const eventBus = new MockEventBus();
  const downloads: string[] = [];
  const renderedLinks: MockAnchor[] = [];
  const opened: Record<string, unknown>[] = [];
  const messages: { type: string; pagesCount?: number; message?: string }[] =
    [];
  const optionValues = new Map<string, unknown>();
  let openFileRequests = 0;
  let printRequests = 0;
  const linkService = {
    externalLinkEnabled: true,
    addLinkAttributes(link: MockAnchor, url: string): void {
      link.href = this.externalLinkEnabled ? url : '';
    },
  };
  const downloadManager = {
    download(): void {
      downloads.push('download');
    },
    downloadData(): void {
      downloads.push('downloadData');
    },
    openOrDownloadData(): boolean {
      downloads.push('openOrDownloadData');
      return true;
    },
  };
  const app = {
    initializedPromise:
      options.initializationError === undefined
        ? Promise.resolve()
        : Promise.reject(options.initializationError),
    page: 1,
    pagesCount: 12,
    pdfLinkService: linkService,
    downloadManager,
    pdfCursorTools: { switchTool: (): void => {} },
    pdfViewer: { currentScaleValue: 'auto', scrollMode: 0, spreadMode: 0 },
    viewsManager: {
      isOpen: false,
      open(): void {
        this.isOpen = true;
      },
      close(): void {
        this.isOpen = false;
      },
    },
    eventBus,
    downloadOrSave(): void {
      this.downloadManager.download();
    },
    async open(args: Record<string, unknown>): Promise<void> {
      if (opened.length > 0) {
        // PDFViewerApplication.close() resets this before reopening.
        linkService.externalLinkEnabled = true;
      }
      for (const id of ['viewBookmark', 'viewBookmarkSeparator']) {
        elements.get(id)?.classes.add('hidden');
      }
      opened.push(args);
      if (
        options.openFailures &&
        Object.prototype.hasOwnProperty.call(
          options.openFailures,
          opened.length,
        )
      ) {
        throw options.openFailures?.[opened.length];
      }
      if (!options.initializeAfterLoaded) {
        eventBus.dispatch('documentinit');
      }
      const link = new MockAnchor();
      linkService.addLinkAttributes(link, 'https://example.invalid/pdf-link');
      renderedLinks.push(link);
      eventBus.dispatch('documentloaded');
      if (options.initializeAfterLoaded) {
        // Model PDF.js setInitialView running after the download-info callback.
        app.page = 1;
        app.pdfViewer.currentScaleValue = 'auto';
        app.pdfViewer.scrollMode = 0;
        app.pdfViewer.spreadMode = 0;
        app.viewsManager.close();
        eventBus.dispatch('documentinit');
      }
      if (options.renderPage !== false) {
        eventBus.dispatch('pagerendered', { pageNumber: 1, error: null });
      }
    },
  };
  eventBus.on('download', () => app.downloadOrSave());
  eventBus.on('namedaction', (event) => {
    if ((event as { action: string }).action === 'SaveAs') {
      app.downloadOrSave();
    }
  });
  eventBus.on('savepageseditedpdf', () => downloadManager.download());
  eventBus.on('openfile', () => openFileRequests++);
  eventBus.on('fileinputchange', () => {
    void app.open({ url: 'blob:https://viewer.invalid/imported-pdf' });
  });
  const window = Object.assign(new MockEventTarget(), {
    parent: {
      get document(): MockEventTarget {
        if (options.parentDocument === 'cross-origin') {
          throw new Error('Blocked cross-origin document access');
        }
        return startupTarget;
      },
    },
    location: new URL('https://viewer.invalid/index.html'),
    PDFViewerApplication: app,
    PDFViewerApplicationOptions: {
      set: (name: string, value: unknown): void => {
        optionValues.set(name, value);
      },
    },
    print: (): void => {
      printRequests++;
    },
  });
  const workerBytes = new TextEncoder().encode(
    'self.postMessage({ sourceName: "worker", targetName: "main", action: "ready" });',
  ).buffer;
  const fetchedWorkerUrls: string[] = [];
  const createdBlobs: MockBlob[] = [];
  const revokedWorkerUrls: string[] = [];
  const workerConstructions: string[] = [];
  const workers: MockWorker[] = [];

  class MockBlob {
    constructor(
      readonly parts: unknown[],
      readonly options: { type: string },
    ) {}
  }

  class MockURL extends URL {
    static createObjectURL(blob: unknown): string {
      createdBlobs.push(blob as MockBlob);
      return `blob:https://viewer.invalid/worker-${createdBlobs.length}`;
    }

    static revokeObjectURL(url: string): void {
      revokedWorkerUrls.push(url);
    }
  }

  class MockWorker extends MockEventTarget {
    terminateCount = 0;

    constructor(
      readonly url: string,
      readonly workerOptions: { type: string },
    ) {
      super();
      workerConstructions.push(url);
      if (options.workerConstructorError !== undefined) {
        throw options.workerConstructorError;
      }
      workers.push(this);
    }

    terminate(): void {
      this.terminateCount++;
    }
  }

  const runtimePath = path.resolve(__dirname, '../../webview/main.js');
  vm.runInNewContext(
    fs.readFileSync(runtimePath, 'utf8'),
    {
      window,
      document,
      URL: MockURL,
      Blob: MockBlob,
      Worker: MockWorker,
      fetch: async (url: string) => {
        fetchedWorkerUrls.push(url);
        if (options.workerFetchError !== undefined) {
          throw options.workerFetchError;
        }
        const status = options.workerFetchStatus ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          arrayBuffer: async (): Promise<ArrayBuffer> => workerBytes,
        };
      },
      Error,
      Element: MockElement,
      HTMLElement: MockElement,
      HTMLAnchorElement: MockAnchor,
      HTMLButtonElement: MockButton,
      HTMLInputElement: MockInput,
      HTMLSelectElement: MockSelect,
      acquireVsCodeApi: () => {
        return {
          postMessage: (message: (typeof messages)[number]): void => {
            messages.push(JSON.parse(JSON.stringify(message)));
          },
        };
      },
    },
    { filename: runtimePath },
  );
  let optionCountAfterForeign: number | undefined;
  if (options.foreignStartupEvent) {
    await startupTarget.emit('webviewerloaded', { detail: { source: {} } });
    optionCountAfterForeign = optionValues.size;
  }
  await startupTarget.emit('webviewerloaded', { detail: { source: window } });
  await window.emit('load');
  return {
    app,
    window,
    config,
    elements,
    eventBus,
    downloads,
    renderedLinks,
    opened,
    messages,
    optionValues,
    startupTarget,
    optionCountAfterForeign,
    workerBytes,
    fetchedWorkerUrls,
    createdBlobs,
    revokedWorkerUrls,
    workerConstructions,
    workers,
    getOpenFileRequests: (): number => openFileRequests,
    getPrintRequests: (): number => printRequests,
  };
}

function pdfTransfer(): MockTransfer {
  return {
    items: [{ kind: 'file', type: 'application/pdf' }],
    files: [{ type: 'application/pdf', name: 'another.pdf' }],
    dropEffect: 'copy',
  };
}

suite('webview runtime policy', () => {
  test('builds one module worker from bundled bytes and reuses it across reloads', async () => {
    const harness = await createHarness();
    assert.deepStrictEqual(harness.fetchedWorkerUrls, [
      harness.config.workerSrc,
    ]);
    assert.strictEqual(harness.workers.length, 1);
    const worker = harness.workers[0];
    assert.strictEqual(harness.optionValues.get('workerPort'), worker);
    assert.strictEqual(worker.workerOptions.type, 'module');
    assert.strictEqual(worker.url, 'blob:https://viewer.invalid/worker-1');
    assert.strictEqual(harness.createdBlobs.length, 1);
    const blob = harness.createdBlobs[0];
    assert.strictEqual(blob.options.type, 'text/javascript');
    assert.strictEqual(blob.parts.length, 1);
    assert.strictEqual(
      blob.parts[0],
      harness.workerBytes,
      'the worker blob must contain the fetched bytes, not an import wrapper',
    );
    assert.deepStrictEqual(harness.revokedWorkerUrls, []);

    await worker.emit('message', { data: { action: 'ready' } });
    await worker.emit('message', { data: { action: 'test' } });
    assert.deepStrictEqual(harness.revokedWorkerUrls, [worker.url]);
    for (let count = 0; count < 2; count++) {
      await harness.window.emit('message', { data: { type: 'reload' } });
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.strictEqual(harness.opened.length, 3);
    assert.strictEqual(harness.workers.length, 1);
    assert.deepStrictEqual(harness.fetchedWorkerUrls, [
      harness.config.workerSrc,
    ]);
    assert.strictEqual(harness.optionValues.get('workerPort'), worker);
    assert.strictEqual(worker.terminateCount, 0);

    await harness.window.emit('beforeunload');
    await harness.window.emit('beforeunload');
    assert.strictEqual(worker.terminateCount, 1);
    assert.deepStrictEqual(harness.revokedWorkerUrls, [worker.url, worker.url]);
  });

  test('reports worker runtime errors to the host', async () => {
    const harness = await createHarness();
    await harness.workers[0].emit('error');
    assert.deepStrictEqual(harness.messages[harness.messages.length - 1], {
      type: 'document-error',
      message: 'The PDF worker failed.',
    });
  });

  test('does not open a PDF or create a worker when its resource fetch fails', async () => {
    for (const [options, message] of [
      [{ workerFetchStatus: 404 }, 'Could not load the PDF worker (404).'],
      [
        { workerFetchError: new Error('Worker resource unavailable') },
        'Worker resource unavailable',
      ],
    ] as const) {
      const harness = await createHarness(options);
      assert.deepStrictEqual(harness.messages, [
        { type: 'document-error', message },
      ]);
      assert.deepStrictEqual(harness.fetchedWorkerUrls, [
        harness.config.workerSrc,
      ]);
      assert.strictEqual(harness.createdBlobs.length, 0);
      assert.strictEqual(harness.workers.length, 0);
      assert.strictEqual(harness.opened.length, 0);
      assert.strictEqual(harness.optionValues.has('workerPort'), false);
    }
  });

  test('revokes the blob URL and reports worker constructor failures', async () => {
    const harness = await createHarness({
      workerConstructorError: new Error('Worker creation failed'),
    });
    assert.deepStrictEqual(harness.messages, [
      { type: 'document-error', message: 'Worker creation failed' },
    ]);
    assert.deepStrictEqual(harness.workerConstructions, [
      'blob:https://viewer.invalid/worker-1',
    ]);
    assert.deepStrictEqual(
      harness.revokedWorkerUrls,
      harness.workerConstructions,
    );
    assert.strictEqual(harness.workers.length, 0);
    assert.strictEqual(harness.opened.length, 0);
    assert.strictEqual(harness.optionValues.has('workerPort'), false);
  });

  test('reports asynchronous viewer initialization failures', async () => {
    const harness = await createHarness({
      initializationError: new Error('Viewer initialization failed'),
    });
    assert.deepStrictEqual(harness.messages, [
      { type: 'document-error', message: 'Viewer initialization failed' },
    ]);
    assert.strictEqual(harness.opened.length, 0);
  });

  test('reports an initial open rejection and allows a later reload to recover', async () => {
    const harness = await createHarness({
      openFailures: { 1: new Error('Initial PDF load failed') },
    });
    assert.deepStrictEqual(harness.messages, [
      { type: 'document-error', message: 'Initial PDF load failed' },
    ]);
    await harness.window.emit('message', { data: { type: 'reload' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(harness.opened.length, 2);
    assert.deepStrictEqual(harness.messages[1], {
      type: 'document-loaded',
      pagesCount: 12,
    });
  });

  test('reports a reload rejection without breaking subsequent reloads', async () => {
    const harness = await createHarness({
      openFailures: { 2: 'Reload failed' },
    });
    await harness.window.emit('message', { data: { type: 'reload' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(harness.messages[1], {
      type: 'document-error',
      message: 'Reload failed',
    });
    await harness.window.emit('message', { data: { type: 'reload' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(harness.opened.length, 3);
    assert.deepStrictEqual(harness.messages[2], {
      type: 'document-loaded',
      pagesCount: 12,
    });
  });

  test('configures PDF.js when startup is dispatched on an accessible parent', async () => {
    const harness = await createHarness({ parentDocument: 'accessible' });
    assert.strictEqual(
      harness.optionValues.get('workerSrc'),
      harness.config.workerSrc,
    );
    assert.strictEqual(harness.optionValues.get('defaultUrl'), '');
    assert.strictEqual(harness.optionValues.get('enableScripting'), false);
  });

  test('uses its own document when parent access is cross-origin', async () => {
    const harness = await createHarness({ parentDocument: 'cross-origin' });
    assert.strictEqual(
      harness.optionValues.get('workerSrc'),
      harness.config.workerSrc,
    );
    assert.strictEqual(harness.optionValues.get('defaultUrl'), '');
    assert.strictEqual(harness.optionValues.get('enableScripting'), false);
  });

  test('ignores another viewer startup without consuming its own startup listener', async () => {
    const harness = await createHarness({
      parentDocument: 'accessible',
      foreignStartupEvent: true,
    });
    assert.strictEqual(harness.optionCountAfterForeign, 0);
    assert.strictEqual(harness.optionValues.get('defaultUrl'), '');
    harness.optionValues.set('defaultUrl', 'unchanged-after-startup');
    await harness.startupTarget.emit('webviewerloaded', {
      detail: { source: harness.window },
    });
    assert.strictEqual(
      harness.optionValues.get('defaultUrl'),
      'unchanged-after-startup',
    );
  });

  test('disables external hrefs before first render and after upstream reload resets', async () => {
    const harness = await createHarness();
    assert.strictEqual(harness.renderedLinks[0].href, '');
    assert.strictEqual(harness.optionValues.get('defaultUrl'), '');
    assert.strictEqual(harness.optionValues.get('enableScripting'), false);
    assert.strictEqual(harness.optionValues.get('isEvalSupported'), false);

    harness.app.page = 4;
    harness.app.pdfViewer.currentScaleValue = '1.5';
    await harness.window.emit('message', { data: { type: 'reload' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(harness.opened.length, 2);
    assert.strictEqual(harness.renderedLinks[1].href, '');
    assert.strictEqual(harness.app.page, 4);
    assert.strictEqual(harness.app.pdfViewer.currentScaleValue, '1.5');
  });

  test('allows opted-in links while preserving PDF.js password restrictions', async () => {
    const harness = await createHarness({ features: { externalLinks: true } });
    assert.strictEqual(
      harness.renderedLinks[0].href,
      'https://example.invalid/pdf-link',
    );
    const service = harness.app.pdfLinkService;
    service.externalLinkEnabled = false;
    const link = new MockAnchor();
    service.addLinkAttributes(link, 'https://example.invalid/restricted');
    assert.strictEqual(link.href, '');
    assert.strictEqual(service.externalLinkEnabled, false);
  });

  test('blocks primary and auxiliary external activation but keeps internal links', async () => {
    const harness = await createHarness();
    const link = new MockAnchor();
    link.href = 'https://example.invalid/';
    const child = new MockElement();
    child.parentElement = link;
    for (const name of ['click', 'auxclick']) {
      const event = await harness.window.emit(name, { target: child });
      assert.strictEqual(event.defaultPrevented, true, name);
      assert.strictEqual(event.stopped, true, name);
    }
    link.href = '#page=2';
    assert.strictEqual(
      (await harness.window.emit('auxclick', { target: link }))
        .defaultPrevented,
      false,
    );

    const optedIn = await createHarness({ features: { externalLinks: true } });
    link.href = 'https://example.invalid/';
    assert.strictEqual(
      (await optedIn.window.emit('auxclick', { target: link }))
        .defaultPrevented,
      false,
    );
  });

  test('blocks direct attachment downloads, named SaveAs and page-export paths', async () => {
    const harness = await createHarness();
    const manager = harness.app.downloadManager;
    manager.download();
    manager.downloadData();
    assert.strictEqual(manager.openOrDownloadData(), false);
    harness.app.downloadOrSave();
    harness.eventBus.dispatch('namedaction', { action: 'SaveAs' });
    harness.eventBus.dispatch('download');
    harness.eventBus.dispatch('savepageseditedpdf');
    assert.deepStrictEqual(harness.downloads, []);
    assert.ok(!harness.eventBus.dispatched.includes('download'));
    assert.ok(!harness.eventBus.dispatched.includes('savepageseditedpdf'));
  });

  test('preserves opted-in download operations and controls', async () => {
    const harness = await createHarness({ features: { download: true } });
    harness.app.downloadManager.downloadData();
    assert.strictEqual(harness.app.downloadManager.openOrDownloadData(), true);
    harness.eventBus.dispatch('download');
    harness.eventBus.dispatch('namedaction', { action: 'SaveAs' });
    harness.eventBus.dispatch('savepageseditedpdf');
    assert.deepStrictEqual(harness.downloads, [
      'downloadData',
      'openOrDownloadData',
      'download',
      'download',
      'download',
    ]);
    for (const id of ['downloadButton', 'secondaryDownload']) {
      assert.strictEqual(harness.elements.get(id)?.hidden, false, id);
      assert.strictEqual(harness.elements.get(id)?.disabled, false, id);
    }
  });

  test('blocks file input, PDF drops and direct imports while allowing the owned PDF', async () => {
    const harness = await createHarness();
    harness.eventBus.dispatch('openfile');
    harness.eventBus.dispatch('fileinputchange', { fileInput: pdfTransfer() });
    await harness.app.open({ url: 'blob:https://viewer.invalid/another-pdf' });
    await harness.app.open({
      url: harness.config.path,
      data: new Uint8Array(),
    });
    assert.strictEqual(harness.getOpenFileRequests(), 0);
    assert.strictEqual(harness.opened.length, 1);
    for (const name of ['dragover', 'drop']) {
      const transfer = pdfTransfer();
      const event = await harness.window.emit(name, { dataTransfer: transfer });
      assert.strictEqual(event.defaultPrevented, true, name);
      assert.strictEqual(event.stopped, true, name);
      assert.strictEqual(transfer.dropEffect, 'none', name);
    }
    await harness.app.open({ url: harness.config.path });
    assert.strictEqual(harness.opened.length, 2);
  });

  test('preserves opted-in file input and drop paths', async () => {
    const harness = await createHarness({ features: { openFile: true } });
    harness.eventBus.dispatch('openfile');
    harness.eventBus.dispatch('fileinputchange', { fileInput: pdfTransfer() });
    assert.strictEqual(harness.getOpenFileRequests(), 1);
    assert.strictEqual(harness.opened.length, 2);
    assert.strictEqual(
      harness.opened[1].url,
      'blob:https://viewer.invalid/imported-pdf',
    );
    const event = await harness.window.emit('drop', {
      dataTransfer: pdfTransfer(),
    });
    assert.strictEqual(event.defaultPrevented, false);
    assert.strictEqual(
      harness.elements.get('secondaryOpenFile')?.hidden,
      false,
    );
  });

  test('keeps enabled feature controls usable and blocks disabled shortcuts', async () => {
    const harness = await createHarness();
    for (const id of [
      'secondaryOpenFile',
      'editorModeButtons',
      'printButton',
      'downloadButton',
      'documentProperties',
      'viewBookmark',
    ]) {
      assert.strictEqual(harness.elements.get(id)?.hidden, true, id);
    }
    for (const key of ['o', 'p', 's']) {
      const event = await harness.window.emit('keydown', {
        key,
        ctrlKey: true,
      });
      assert.strictEqual(event.defaultPrevented, true, key);
    }
    harness.window.print();
    assert.strictEqual(harness.getPrintRequests(), 0);

    const enabledFeatures = Object.fromEntries(
      Object.keys(PREVIEW_FEATURE_DEFAULTS).map((key) => [key, true]),
    );
    const enabled = await createHarness({ features: enabledFeatures });
    for (const [id, element] of enabled.elements) {
      assert.strictEqual(element.hidden, false, id);
      assert.strictEqual(element.disabled, false, id);
    }
    for (const key of ['o', 'p', 's']) {
      const event = await enabled.window.emit('keydown', {
        key,
        ctrlKey: true,
      });
      assert.strictEqual(event.defaultPrevented, false, key);
    }
    enabled.window.print();
    assert.strictEqual(enabled.getPrintRequests(), 1);
  });

  test('reports loaded only after a page renders and reports render failures', async () => {
    const harness = await createHarness({ renderPage: false });
    assert.deepStrictEqual(harness.messages, []);
    harness.eventBus.dispatch('pagerendered', {
      pageNumber: 1,
      error: 'Cannot render page',
    });
    assert.deepStrictEqual(harness.messages, [
      { type: 'document-error', message: 'Cannot render page' },
    ]);
    harness.eventBus.dispatch('pagerendered', { pageNumber: 1, error: null });
    harness.eventBus.dispatch('pagerendered', { pageNumber: 2, error: null });
    assert.deepStrictEqual(harness.messages.slice(1), [
      { type: 'document-loaded', pagesCount: 12 },
    ]);
    harness.eventBus.dispatch('documentinit');
    harness.eventBus.dispatch('pagerendered', { pageNumber: 3, error: null });
    assert.strictEqual(harness.messages.length, 3);
  });

  test('restores opted-in Current View on open, import and reload', async () => {
    const harness = await createHarness({
      features: { currentView: true, openFile: true },
    });
    for (const id of ['viewBookmark', 'viewBookmarkSeparator']) {
      assert.strictEqual(
        harness.elements.get(id)?.classes.has('hidden'),
        false,
      );
    }
    await harness.app.open({ url: 'blob:https://viewer.invalid/imported-pdf' });
    assert.strictEqual(harness.opened.length, 2);
    for (const id of ['viewBookmark', 'viewBookmarkSeparator']) {
      assert.strictEqual(
        harness.elements.get(id)?.classes.has('hidden'),
        false,
      );
    }
    await harness.window.emit('message', { data: { type: 'reload' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(harness.opened.length, 3);
    for (const id of ['viewBookmark', 'viewBookmarkSeparator']) {
      assert.strictEqual(
        harness.elements.get(id)?.classes.has('hidden'),
        false,
      );
    }
    const disabled = await createHarness();
    assert.strictEqual(
      disabled.elements
        .get('viewBookmark')
        ?.getAttribute('data-pdf-preview-hidden'),
      'true',
    );
  });

  test('restores the reload view after late upstream initial-view setup', async () => {
    const harness = await createHarness({ initializeAfterLoaded: true });
    harness.app.page = 6;
    harness.app.pdfViewer.currentScaleValue = 'page-width';
    harness.app.pdfViewer.scrollMode = 2;
    harness.app.pdfViewer.spreadMode = 1;
    harness.app.viewsManager.isOpen = true;
    await harness.window.emit('message', { data: { type: 'reload' } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(harness.app.page, 6);
    assert.strictEqual(harness.app.pdfViewer.currentScaleValue, 'page-width');
    assert.strictEqual(harness.app.pdfViewer.scrollMode, 2);
    assert.strictEqual(harness.app.pdfViewer.spreadMode, 1);
    assert.strictEqual(harness.app.viewsManager.isOpen, true);
  });
});
