import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

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
      fs.realpathSync(extension.extensionPath),
      fs.realpathSync(extensionPath),
      'tests must exercise the selected extension artifact',
    );
    await extension.activate();
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
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    if (fixtureDir) {
      await vscode.workspace.fs.delete(fixtureDir, { recursive: true });
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
