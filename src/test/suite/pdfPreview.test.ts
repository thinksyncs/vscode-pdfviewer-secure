import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

function buildMinimalPdf(): Uint8Array {
  const header = '%PDF-1.4\n';
  const content = 'BT\n/F1 24 Tf\n72 72 Td\n(Hello PDF) Tj\nET';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(
      content,
      'ascii',
    )} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];

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

suite('pdf preview integration', () => {
  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('opens a pdf in the custom editor', async function () {
    this.timeout(20000);

    const tempDir = vscode.Uri.file(
      fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-pdfviewer-test-fixtures-')),
    );
    const pdfUri = vscode.Uri.joinPath(tempDir, 'minimal.pdf');

    await vscode.workspace.fs.createDirectory(tempDir);
    await vscode.workspace.fs.writeFile(pdfUri, buildMinimalPdf());

    await vscode.commands.executeCommand(
      'vscode.openWith',
      pdfUri,
      'vscode-pdfviewer.preview',
    );

    assert.ok(true, 'custom editor should open without throwing');
  });
});
