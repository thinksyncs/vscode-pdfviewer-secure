// Keep this entry point a classic browser script. A top-level import would
// emit CommonJS exports, which are unavailable inside the webview.
type CursorTool = import('../config').CursorTool;
type PreviewWebviewSettings = import('../config').PreviewWebviewSettings;
type ScrollMode = import('../config').ScrollMode;
type SpreadMode = import('../config').SpreadMode;

interface ReloadMessage {
  type: 'reload';
}

interface VsCodeApi {
  postMessage: (message: unknown) => void;
}

interface ViewerState {
  page: number;
  scale: string;
  scrollMode: number;
  spreadMode: number;
  sidebarOpen: boolean;
}

interface PdfLinkService {
  externalLinkEnabled: boolean;
  addLinkAttributes: (
    link: HTMLAnchorElement,
    url: string,
    newWindow?: boolean,
  ) => void;
}

interface DownloadManager {
  download: (...args: unknown[]) => void;
  downloadData: (...args: unknown[]) => void;
  openOrDownloadData: (...args: unknown[]) => boolean;
}

interface PdfCursorTools {
  switchTool: (tool: number) => void;
}

interface PdfViewer {
  currentScaleValue: string;
  scrollMode: number;
  spreadMode: number;
}

interface ViewsManager {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

interface EventBus {
  on: (name: string, handler: (event?: unknown) => void) => void;
  off: (name: string, handler: (event?: unknown) => void) => void;
  dispatch: (name: string, data?: unknown) => unknown;
}

interface PdfViewerApp {
  initializedPromise: Promise<void>;
  page: number;
  pagesCount: number;
  pdfLinkService?: PdfLinkService;
  downloadManager?: DownloadManager;
  pdfCursorTools: PdfCursorTools;
  pdfViewer: PdfViewer;
  viewsManager?: ViewsManager;
  eventBus: EventBus;
  open: (args: Record<string, unknown>) => Promise<void>;
}

interface PdfViewerApplicationOptions {
  set: (name: string, value: unknown) => void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface Window {
  PDFViewerApplication: PdfViewerApp;
  PDFViewerApplicationOptions: PdfViewerApplicationOptions;
}

let vscodeApi: VsCodeApi | undefined;

function getVsCodeApi(): VsCodeApi | undefined {
  if (typeof acquireVsCodeApi !== 'function') {
    return undefined;
  }
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

function postHostMessage(message: unknown): void {
  getVsCodeApi()?.postMessage(message);
}

function reportDocumentError(error: unknown): void {
  postHostMessage({
    type: 'document-error',
    message: error instanceof Error ? error.message : String(error),
  });
}

async function initializeWorker(config: PreviewWebviewSettings): Promise<void> {
  // VS Code webview workers cannot import extension resource URLs. Fetch the
  // bundled worker once and give PDF.js its port without changing upstream code.
  const response = await fetch(config.workerSrc);
  if (!response.ok) {
    throw new Error(`Could not load the PDF worker (${response.status}).`);
  }
  const workerUrl = URL.createObjectURL(
    new Blob([await response.arrayBuffer()], { type: 'text/javascript' }),
  );
  let worker: Worker;
  try {
    worker = new Worker(workerUrl, { type: 'module' });
  } catch (error) {
    URL.revokeObjectURL(workerUrl);
    throw error;
  }
  worker.addEventListener('message', () => URL.revokeObjectURL(workerUrl), {
    once: true,
  });
  worker.addEventListener('error', () => {
    reportDocumentError(new Error('The PDF worker failed.'));
  });
  window.addEventListener(
    'beforeunload',
    () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    },
    { once: true },
  );
  window.PDFViewerApplicationOptions.set('workerPort', worker);
}

function loadConfig(): PreviewWebviewSettings {
  const elem = document.getElementById('pdf-preview-config');
  if (elem) {
    return JSON.parse(
      elem.getAttribute('data-config') ?? '',
    ) as PreviewWebviewSettings;
  }
  throw new Error('Could not load configuration.');
}

function cursorTools(name: CursorTool): number {
  return name === 'hand' ? 1 : 0;
}

function scrollMode(name: ScrollMode): number {
  switch (name) {
    case 'vertical':
      return 0;
    case 'horizontal':
      return 1;
    case 'wrapped':
      return 2;
  }
}

function spreadMode(name: SpreadMode): number {
  switch (name) {
    case 'none':
      return 0;
    case 'odd':
      return 1;
    case 'even':
      return 2;
  }
}

function createLoadOptions(
  config: PreviewWebviewSettings,
): Record<string, unknown> {
  return {
    url: config.path,
    useWorkerFetch: false,
    annotationMode: config.features.forms
      ? config.runtime.annotationModeEnableForms
      : config.runtime.annotationModeEnable,
    cMapUrl: config.cMapUrl,
    cMapPacked: true,
    enableXfa: config.features.forms,
    iccUrl: config.iccUrl,
    standardFontDataUrl: config.standardFontDataUrl,
    wasmUrl: config.wasmUrl,
    isEvalSupported: false,
  };
}

function setElementHidden(
  element: Element | null | undefined,
  hidden: boolean,
): void {
  if (!element) {
    return;
  }

  if (element instanceof HTMLElement) {
    element.hidden = hidden;
  }
  element.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  element.setAttribute('data-pdf-preview-hidden', hidden ? 'true' : 'false');

  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement
  ) {
    element.disabled = hidden;
  }
}

function hideElementById(id: string): void {
  setElementHidden(document.getElementById(id), true);
}

function hideToolbarGroupFor(controlId: string): void {
  const control = document.getElementById(controlId);
  const group = control?.closest('.toolbarHorizontalGroup, .visibleMediumView');
  setElementHidden(group, true);

  const separator = group?.nextElementSibling;
  if (separator?.classList.contains('verticalToolbarSeparator')) {
    setElementHidden(separator, true);
  }
}

function applyFeatureVisibility(config: PreviewWebviewSettings): void {
  if (!config.features.annotationEditing) {
    hideElementById('editorModeButtons');
    hideElementById('editorModeSeparator');
  }
  if (!config.features.openFile) {
    hideElementById('secondaryOpenFile');
    hideElementById('viewsManagerAddFileButton');
  }
  if (!config.features.currentView) {
    hideElementById('viewBookmark');
    hideElementById('viewBookmarkSeparator');
  }
  if (!config.features.documentProperties) {
    hideElementById('documentProperties');
  }
  if (!config.features.print) {
    hideElementById('printButton');
    hideElementById('secondaryPrint');
  }
  if (!config.features.download) {
    hideElementById('downloadButton');
    hideElementById('secondaryDownload');
    hideElementById('viewsManagerStatusActionSaveAs');
  }
  if (!config.features.print && !config.features.download) {
    hideToolbarGroupFor('printButton');
  }
}

function isBlockedShortcut(
  event: KeyboardEvent,
  config: PreviewWebviewSettings,
): boolean {
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  if (!hasPrimaryModifier || event.altKey) {
    return false;
  }

  switch ((event.key ?? '').toLowerCase()) {
    case 'o':
      return !config.features.openFile;
    case 'p':
      return !config.features.print;
    case 's':
      return !config.features.download;
    default:
      return false;
  }
}

function isExternalNavigationHref(href: string): boolean {
  if (!href || href.startsWith('#')) {
    return false;
  }

  try {
    return (
      new URL(href, window.location.href).origin !== window.location.origin
    );
  } catch {
    return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href);
  }
}

function blockDisallowedActions(
  app: PdfViewerApp,
  config: PreviewWebviewSettings,
): void {
  const linkService = app.pdfLinkService;
  if (linkService) {
    const addLinkAttributes = linkService.addLinkAttributes.bind(linkService);
    linkService.addLinkAttributes = (link, url, newWindow): void => {
      // PDF.js resets this flag on close; enforce the preference at rendering.
      const enabled = linkService.externalLinkEnabled;
      linkService.externalLinkEnabled =
        enabled && config.features.externalLinks;
      try {
        addLinkAttributes(link, url, newWindow);
      } finally {
        linkService.externalLinkEnabled = enabled;
      }
    };
  }

  if (!config.features.download && app.downloadManager) {
    // Attachments and named SaveAs actions can bypass the toolbar event bus.
    app.downloadManager.download = (): void => {};
    app.downloadManager.downloadData = (): void => {};
    app.downloadManager.openOrDownloadData = (): boolean => false;
  }

  const blockedEvents = new Set<string>();
  if (!config.features.openFile) {
    blockedEvents.add('openfile');
    blockedEvents.add('fileinputchange');

    const open = app.open.bind(app);
    app.open = (args): Promise<void> => {
      if (args.url !== config.path || args.data !== undefined) {
        return Promise.resolve();
      }
      return open(args);
    };

    const blockPdfDrop = (event: DragEvent): void => {
      const transfer = event.dataTransfer;
      if (
        !transfer ||
        !(
          Array.from(transfer.items).some(
            (item) => item.kind === 'file' && item.type === 'application/pdf',
          ) ||
          Array.from(transfer.files).some(
            (file) =>
              file.type === 'application/pdf' || /\.pdf$/i.test(file.name),
          )
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      transfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', blockPdfDrop, true);
    window.addEventListener('drop', blockPdfDrop, true);
  }
  if (!config.features.download) {
    blockedEvents.add('download');
    blockedEvents.add('savepageseditedpdf');
  }
  if (!config.features.print) {
    blockedEvents.add('print');
    window.print = (): void => {};
  }
  if (!config.features.annotationEditing) {
    blockedEvents.add('switchannotationeditormode');
  }
  if (!config.features.documentProperties) {
    blockedEvents.add('documentproperties');
  }

  if (blockedEvents.size > 0) {
    const originalDispatch = app.eventBus.dispatch.bind(app.eventBus);
    app.eventBus.dispatch = (eventName: string, data?: unknown): unknown => {
      if (blockedEvents.has(eventName)) {
        return undefined;
      }
      return originalDispatch(eventName, data);
    };
  }

  window.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (!isBlockedShortcut(event, config)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  const blockClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest('a[href]');
    if (anchor instanceof HTMLAnchorElement) {
      if (!config.features.currentView && anchor.id === 'viewBookmark') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        !config.features.externalLinks &&
        isExternalNavigationHref(anchor.getAttribute('href') ?? '')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }

    const control = target.closest(
      '#secondaryOpenFile, #printButton, #secondaryPrint, #downloadButton, #secondaryDownload, #documentProperties',
    );
    if (!control) {
      return;
    }

    const disabled =
      (!config.features.openFile && control.id === 'secondaryOpenFile') ||
      (!config.features.print &&
        (control.id === 'printButton' || control.id === 'secondaryPrint')) ||
      (!config.features.download &&
        (control.id === 'downloadButton' ||
          control.id === 'secondaryDownload')) ||
      (!config.features.documentProperties &&
        control.id === 'documentProperties');

    if (!disabled) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener('click', blockClick, true);
  window.addEventListener('auxclick', blockClick, true);
}

function applyViewerState(
  app: PdfViewerApp,
  state: ViewerState,
  defaultCursor: CursorTool,
): void {
  app.pdfCursorTools.switchTool(cursorTools(defaultCursor));
  app.pdfViewer.currentScaleValue = state.scale;
  app.pdfViewer.scrollMode = state.scrollMode;
  app.pdfViewer.spreadMode = state.spreadMode;
  app.page = state.page;

  if (!app.viewsManager) {
    return;
  }

  if (state.sidebarOpen) {
    app.viewsManager.open();
  } else {
    app.viewsManager.close();
  }
}

function captureViewerState(
  app: PdfViewerApp,
  config: PreviewWebviewSettings,
): ViewerState {
  return {
    page: app.page,
    scale: app.pdfViewer.currentScaleValue || config.defaults.scale,
    scrollMode: app.pdfViewer.scrollMode,
    spreadMode: app.pdfViewer.spreadMode,
    sidebarOpen: app.viewsManager ? app.viewsManager.isOpen : false,
  };
}

function createInitialViewerState(config: PreviewWebviewSettings): ViewerState {
  return {
    page: 1,
    scale: config.defaults.scale,
    scrollMode: scrollMode(config.defaults.scrollMode),
    spreadMode: spreadMode(config.defaults.spreadMode),
    sidebarOpen: config.defaults.sidebar,
  };
}

function onceDocumentLoaded(
  app: PdfViewerApp,
  action: () => void,
): { promise: Promise<void>; dispose: () => void } {
  let onLoaded: (() => void) | undefined;
  let onInitialized: (() => void) | undefined;
  const dispose = (): void => {
    if (onLoaded) {
      app.eventBus.off('documentloaded', onLoaded);
      onLoaded = undefined;
    }
    if (onInitialized) {
      app.eventBus.off('documentinit', onInitialized);
      onInitialized = undefined;
    }
  };
  const promise = new Promise<void>((resolve, reject) => {
    let loaded = false;
    let initialized = false;
    const finish = (): void => {
      // Initial view setup can finish after documentloaded and reset the view.
      if (!loaded || !initialized) {
        return;
      }
      dispose();
      try {
        action();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    onLoaded = (): void => {
      loaded = true;
      finish();
    };
    onInitialized = (): void => {
      initialized = true;
      finish();
    };
    app.eventBus.on('documentloaded', onLoaded);
    app.eventBus.on('documentinit', onInitialized);
  });

  return { promise, dispose };
}

async function openDocument(
  app: PdfViewerApp,
  config: PreviewWebviewSettings,
  state: ViewerState,
): Promise<void> {
  const onLoaded = onceDocumentLoaded(app, () => {
    applyViewerState(app, state, config.defaults.cursor);
  });

  try {
    await app.open(createLoadOptions(config));
    await onLoaded.promise;
  } catch (error) {
    onLoaded.dispose();
    throw error;
  }
}

function applyViewerOptions(
  options: PdfViewerApplicationOptions,
  config: PreviewWebviewSettings,
): void {
  options.set(
    'annotationEditorMode',
    config.features.annotationEditing
      ? config.runtime.annotationEditorModeNone
      : config.runtime.annotationEditorModeDisable,
  );
  options.set(
    'annotationMode',
    config.features.forms
      ? config.runtime.annotationModeEnableForms
      : config.runtime.annotationModeEnable,
  );
  options.set('cMapUrl', config.cMapUrl);
  options.set('cMapPacked', true);
  options.set('iccUrl', config.iccUrl);
  options.set('imageResourcesPath', config.imageResourcesPath);
  options.set('sandboxBundleSrc', config.sandboxBundleSrc);
  options.set('standardFontDataUrl', config.standardFontDataUrl);
  options.set('defaultZoomValue', config.defaults.scale);
  options.set('defaultUrl', '');
  options.set('enableAutoLinking', config.features.externalLinks);
  options.set('enableComment', config.features.annotationEditing);
  options.set('enableSignatureEditor', config.features.annotationEditing);
  options.set(
    'enableHighlightFloatingButton',
    config.features.annotationEditing,
  );
  options.set('wasmUrl', config.wasmUrl);
  options.set('workerSrc', config.workerSrc);
  options.set('cursorToolOnLoad', cursorTools(config.defaults.cursor));
  options.set('scrollModeOnLoad', scrollMode(config.defaults.scrollMode));
  options.set('spreadModeOnLoad', spreadMode(config.defaults.spreadMode));
  options.set('sidebarViewOnLoad', config.defaults.sidebar ? 1 : 0);
  options.set('disablePreferences', true);
  options.set('enableScripting', false);
  options.set('enableXfa', config.features.forms);
  options.set('isEvalSupported', false);
}

function isReloadMessage(value: unknown): value is ReloadMessage {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as ReloadMessage).type === 'reload',
  );
}

const config = loadConfig();

// PDF.js dispatches on the parent document when same-origin access is allowed.
let viewerEventDocument: Document;
try {
  viewerEventDocument = window.parent.document;
} catch {
  viewerEventDocument = document;
}
const onViewerLoaded = (event: Event): void => {
  if ((event as CustomEvent<{ source?: Window }>).detail?.source !== window) {
    return;
  }
  viewerEventDocument.removeEventListener('webviewerloaded', onViewerLoaded);
  applyViewerOptions(window.PDFViewerApplicationOptions, config);
};
viewerEventDocument.addEventListener('webviewerloaded', onViewerLoaded);

window.addEventListener(
  'load',
  async () => {
    try {
      const app = window.PDFViewerApplication;

      await app.initializedPromise;
      applyFeatureVisibility(config);
      blockDisallowedActions(app, config);
      await initializeWorker(config);

      let reportedRenderedPage = false;
      app.eventBus.on('documentinit', () => {
        reportedRenderedPage = false;
        if (config.features.currentView) {
          // Startup and close() hide this, including when importing another PDF.
          for (const id of ['viewBookmark', 'viewBookmarkSeparator']) {
            document.getElementById(id)?.classList.remove('hidden');
          }
        }
      });
      app.eventBus.on('pagerendered', (event?: unknown) => {
        const detail = event as
          { pageNumber?: number; error?: unknown } | undefined;
        if (detail?.error) {
          postHostMessage({
            type: 'document-error',
            message: String(detail.error),
          });
          return;
        }
        if (!reportedRenderedPage && typeof detail?.pageNumber === 'number') {
          reportedRenderedPage = true;
          postHostMessage({
            type: 'document-loaded',
            pagesCount: app.pagesCount,
          });
        }
      });

      app.eventBus.on('documenterror', (event?: unknown) => {
        const detail = event as
          { reason?: string; message?: string } | undefined;
        postHostMessage({
          type: 'document-error',
          message: detail?.reason || detail?.message || 'Unknown PDF.js error',
        });
      });

      let pendingOpen = openDocument(
        app,
        config,
        createInitialViewerState(config),
      ).catch(reportDocumentError);

      window.addEventListener('message', (event: MessageEvent) => {
        if (!isReloadMessage(event.data)) {
          return;
        }

        pendingOpen = pendingOpen
          .then(async () => {
            const state = captureViewerState(app, config);
            await openDocument(app, config, state);
          })
          .catch(reportDocumentError);
      });
      await pendingOpen;
    } catch (error) {
      reportDocumentError(error);
    }
  },
  { once: true },
);

window.onerror = (): void => {
  postHostMessage({
    type: 'document-error',
    message: 'An unexpected error occurred while loading the PDF.',
  });
  const msg = document.createElement('body');
  msg.innerText =
    'An error occurred while loading the file. Please open it again.';
  document.body = msg;
};
