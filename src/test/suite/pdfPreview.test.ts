import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { deflateSync } from 'zlib';
import * as vscode from 'vscode';
import type { PdfPreviewExtensionApi } from '../../extension';
import type { PdfAgentTool } from '../../agentTools';

type PreviewLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; pagesCount: number }
  | { status: 'error'; message: string };

function buildMinimalPdf(pagesCount = 1): Uint8Array {
  const header = '%PDF-1.4\n';
  const pageReferences = Array.from(
    { length: pagesCount },
    (_, index) => `${4 + index * 2} 0 R`,
  ).join(' ');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageReferences}] /Count ${pagesCount} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  for (let index = 0; index < pagesCount; index++) {
    const pageObject = 4 + index * 2;
    const content = `BT\n/F1 24 Tf\n72 72 Td\n(Page ${index + 1}) Tj\nET`;
    objects.push(
      `${pageObject} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObject + 1} 0 R >>\nendobj\n`,
      `${pageObject + 1} 0 obj\n<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream\nendobj\n`,
    );
  }

  let body = header;
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += object;
  }

  const startXRef = Buffer.byteLength(body, 'ascii');
  const xrefEntries = offsets
    .map((offset, index) =>
      index === 0
        ? '0000000000 65535 f \n'
        : `${offset.toString().padStart(10, '0')} 00000 n \n`,
    )
    .join('');

  const xref = `xref\n0 ${offsets.length}\n${xrefEntries}`;
  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXRef}\n%%EOF\n`;

  return Uint8Array.from(Buffer.from(body + xref + trailer, 'ascii'));
}

function buildResourcePdf(cjk: boolean): Uint8Array {
  const content = cjk
    ? 'BT /F1 24 Tf 20 70 Td <65E5672C8A9E> Tj ET'
    : 'BT /F1 24 Tf 20 70 Td (Offline image) Tj ET q 20 0 0 20 20 20 cm /Im1 Do Q';
  const image = deflateSync(
    Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]),
  );
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>',
    ),
    Buffer.from(
      cjk
        ? '<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiMin-W3 /Encoding /UniJIS-UTF16-H /DescendantFonts [7 0 R] >>'
        : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ),
    Buffer.from(
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`,
      ),
      image,
      Buffer.from('\nendstream'),
    ]),
    Buffer.from(
      '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiMin-W3 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> /FontDescriptor 8 0 R /DW 1000 >>',
    ),
    Buffer.from(
      '<< /Type /FontDescriptor /FontName /HeiseiMin-W3 /Flags 6 /FontBBox [-123 -257 1001 910] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>',
    ),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let size = chunks[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(size);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from('\nendobj\n'),
    ]);
    chunks.push(chunk);
    size += chunk.length;
  }
  chunks.push(
    Buffer.from(
      `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
        .join(
          '',
        )}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}

async function waitForPreviewState(
  expected: (state: PreviewLoadState) => boolean,
  allowError = false,
): Promise<PreviewLoadState> {
  const deadline = Date.now() + 30000;
  let lastState: PreviewLoadState | undefined;
  while (Date.now() < deadline) {
    lastState = await vscode.commands.executeCommand<PreviewLoadState>(
      'pdf-preview._getActivePreviewLoadState',
    );
    if (lastState && expected(lastState)) {
      return lastState;
    }
    if (lastState?.status === 'error' && !allowError) {
      throw new Error(`PDF preview failed: ${lastState.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for PDF preview: ${JSON.stringify(lastState)}`,
  );
}

function waitForPageCount(pagesCount: number): Promise<PreviewLoadState> {
  return waitForPreviewState(
    (state) => state.status === 'loaded' && state.pagesCount === pagesCount,
  );
}

suite('pdf preview integration', () => {
  let fixtureDir: vscode.Uri;
  let api: PdfPreviewExtensionApi;
  let Tool: typeof PdfAgentTool;

  suiteSetup(async () => {
    const extensionPath = process.env.PDF_PREVIEW_TEST_EXTENSION_PATH;
    assert.ok(extensionPath, 'runner must identify the extension under test');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf8'),
    ) as { publisher: string; name: string };
    const extension = vscode.extensions.getExtension(
      `${manifest.publisher}.${manifest.name}`,
    );
    assert.ok(
      extension,
      'the requested development extension must be installed',
    );
    assert.strictEqual(
      fs.realpathSync.native(extension.extensionPath),
      fs.realpathSync.native(extensionPath),
      'tests must exercise the selected extension artifact',
    );
    api = (await extension.activate()) as PdfPreviewExtensionApi;
    // Load the implementation from the selected source or unpacked VSIX.
    const module = (await import(
      path.join(extensionPath, 'out/src/agentTools.js')
    )) as { PdfAgentTool: typeof PdfAgentTool };
    Tool = module.PdfAgentTool;
    assert.strictEqual(
      vscode.workspace.getConfiguration('pdf-preview').get('agent.enabled'),
      false,
    );
    for (const feature of [
      'externalLinks',
      'openFile',
      'download',
      'print',
      'documentProperties',
      'currentView',
      'forms',
      'annotationEditing',
    ]) {
      assert.strictEqual(
        vscode.workspace
          .getConfiguration('pdf-preview')
          .get(`features.${feature}`),
        false,
        `${feature} must be disabled in a fresh profile`,
      );
    }
  });

  setup(() => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(
      workspaceFolder,
      'runner must supply an isolated fixture workspace',
    );
    fixtureDir = vscode.Uri.file(
      fs.mkdtempSync(path.join(workspaceFolder.uri.fsPath, 'pdf-fixtures-')),
    );
  });

  teardown(async () => {
    await vscode.workspace
      .getConfiguration('pdf-preview')
      .update('agent.enabled', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    if (fixtureDir) {
      await vscode.workspace.fs.delete(fixtureDir, { recursive: true });
    }
  });

  async function enableAgent(): Promise<void> {
    await vscode.workspace
      .getConfiguration('pdf-preview')
      .update('agent.enabled', true, vscode.ConfigurationTarget.Global);
  }

  function decodeResult(
    result: vscode.LanguageModelToolResult,
  ): Record<string, unknown> {
    assert.strictEqual(result.content.length, 1);
    const part = result.content[0];
    assert.ok(part instanceof vscode.LanguageModelTextPart);
    return JSON.parse(part.value) as Record<string, unknown>;
  }

  test('registers both agent tools when enabled', async () => {
    await enableAgent();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const names = vscode.lm.tools.map((tool) => tool.name);
      if (
        names.includes('pdf_preview_open') &&
        names.includes('pdf_preview_status')
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail('PDF agent tools were not registered');
  });

  test('rejects direct tool calls while disabled and after cancellation', async () => {
    const file = vscode.Uri.joinPath(fixtureDir, 'denied.pdf');
    await vscode.workspace.fs.writeFile(file, buildMinimalPdf());
    const options = {
      input: { path: file.fsPath },
      toolInvocationToken: undefined,
    };
    const token = new vscode.CancellationTokenSource();
    try {
      const tool = new Tool(api.getPreviewLoadState, true);
      await assert.rejects(tool.invoke(options, token.token), /User Settings/);
      await enableAgent();
      token.cancel();
      await assert.rejects(tool.invoke(options, token.token), /Canceled/);
      assert.strictEqual(api.getPreviewLoadState(file), undefined);
    } finally {
      token.dispose();
    }
  });

  test('opens a PDF through the agent tool and reports only metadata', async () => {
    await enableAgent();
    const file = vscode.Uri.joinPath(fixtureDir, 'agent.pdf');
    await vscode.workspace.fs.writeFile(file, buildMinimalPdf(2));
    const options = {
      input: { path: file.fsPath },
      toolInvocationToken: undefined,
    };
    const token = new vscode.CancellationTokenSource();
    try {
      const tool = new Tool(api.getPreviewLoadState, true);
      const preparation = await tool.prepareInvocation(options, token.token);
      assert.ok(preparation.confirmationMessages);
      const message = preparation.confirmationMessages.message;
      assert.ok(message instanceof vscode.MarkdownString);
      assert.ok(message.value.includes('agent.pdf'));
      assert.ok(!message.isTrusted);
      const result = decodeResult(await tool.invoke(options, token.token));
      assert.deepStrictEqual(result, {
        path: fs.realpathSync.native(file.fsPath),
        status: 'loaded',
        pagesCount: 2,
      });
    } finally {
      token.dispose();
    }
  });

  test('gets status for the requested PDF even when another editor is active', async () => {
    await enableAgent();
    const first = await openPdf('first.pdf', buildMinimalPdf());
    await waitForPageCount(1);
    await openPdf('second.pdf', buildMinimalPdf(3));
    await waitForPageCount(3);
    const tool = new Tool(api.getPreviewLoadState, false);
    const token = new vscode.CancellationTokenSource();
    const options = {
      input: { path: first.fsPath },
      toolInvocationToken: undefined,
    };
    try {
      assert.deepStrictEqual(
        decodeResult(await tool.invoke(options, token.token)),
        {
          path: fs.realpathSync.native(first.fsPath),
          status: 'loaded',
          pagesCount: 1,
        },
      );
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      assert.deepStrictEqual(
        decodeResult(await tool.invoke(options, token.token)),
        { path: fs.realpathSync.native(first.fsPath), status: 'not_open' },
      );
    } finally {
      token.dispose();
    }
  });

  test('rejects paths outside the workspace without opening an editor', async () => {
    await enableAgent();
    const token = new vscode.CancellationTokenSource();
    try {
      const tool = new Tool(api.getPreviewLoadState, true);
      const outside = path.resolve(fixtureDir.fsPath, '../../outside.pdf');
      await assert.rejects(
        tool.invoke(
          { input: { path: outside }, toolInvocationToken: undefined },
          token.token,
        ),
        /inside an open local workspace/,
      );
      assert.strictEqual(api.getActivePreviewLoadState(), undefined);
    } finally {
      token.dispose();
    }
  });

  test('returns an error status without forwarding PDF error text', async () => {
    await enableAgent();
    const file = vscode.Uri.joinPath(fixtureDir, 'agent-malformed.pdf');
    await vscode.workspace.fs.writeFile(file, Buffer.from('not a PDF'));
    const token = new vscode.CancellationTokenSource();
    try {
      const tool = new Tool(api.getPreviewLoadState, true);
      assert.deepStrictEqual(
        decodeResult(
          await tool.invoke(
            { input: { path: file.fsPath }, toolInvocationToken: undefined },
            token.token,
          ),
        ),
        { path: fs.realpathSync.native(file.fsPath), status: 'error' },
      );
    } finally {
      token.dispose();
    }
  });

  async function openPdf(
    name: string,
    contents: Uint8Array,
  ): Promise<vscode.Uri> {
    const pdfUri = vscode.Uri.joinPath(fixtureDir, name);
    await vscode.workspace.fs.writeFile(pdfUri, contents);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      pdfUri,
      'vscode-pdfviewer.preview',
      {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
        preview: false,
      },
    );
    return pdfUri;
  }

  test('renders a single-page PDF in the custom editor', async () => {
    await openPdf('minimal.pdf', buildMinimalPdf());
    await waitForPageCount(1);
  });

  test('renders a PDF containing a compressed image', async () => {
    await openPdf('offline-image.pdf', buildResourcePdf(false));
    await waitForPageCount(1);
  });

  test('renders a PDF using the bundled Japanese character map', async () => {
    await openPdf('日本語.pdf', buildResourcePdf(true));
    await waitForPageCount(1);
  });

  test('reloads the PDF after its contents change', async () => {
    const pdfUri = await openPdf('reload.pdf', buildMinimalPdf());
    await waitForPageCount(1);
    await vscode.workspace.fs.writeFile(pdfUri, buildMinimalPdf(2));
    await waitForPageCount(2);
  });

  test('renders the first page of a PDF with multiple pages', async () => {
    await openPdf('multiple-pages.pdf', buildMinimalPdf(3));
    await waitForPageCount(3);
  });

  test('reports an error for malformed PDF content', async () => {
    await openPdf('malformed.pdf', Buffer.from('This is not a PDF document.'));
    const state = await waitForPreviewState(
      (value) => value.status === 'error',
      true,
    );
    assert.strictEqual(state.status, 'error');
    if (state.status === 'error') {
      assert.ok(
        state.message.length > 0,
        'load failure must include an explanation',
      );
    }
  });

  test('releases the active preview after its editor closes', async () => {
    await openPdf('close.pdf', buildMinimalPdf());
    await waitForPageCount(1);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const state = await vscode.commands.executeCommand<PreviewLoadState>(
        'pdf-preview._getActivePreviewLoadState',
      );
      if (state === undefined) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail('closed editor retained an active preview');
  });
});
