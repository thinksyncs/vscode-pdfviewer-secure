import * as fs from 'fs';
import * as vscode from 'vscode';
import { PdfPreview, PreviewLoadState } from './pdfPreview';

export class PdfCustomProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'vscode-pdfviewer.preview';

  private readonly _previews = new Map<PdfPreview, string>();
  private _activePreview: PdfPreview | undefined;

  constructor(private readonly extensionRoot: vscode.Uri) {}

  public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: (): void => {} };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewEditor: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    let resourceKey = document.uri.toString();
    if (document.uri.scheme === 'file') {
      try {
        resourceKey = vscode.Uri.file(
          await fs.promises.realpath(document.uri.fsPath),
        ).toString();
      } catch {
        // Let the viewer report inaccessible documents as before.
      }
    }
    if (token.isCancellationRequested) {
      return;
    }
    const preview = new PdfPreview(
      this.extensionRoot,
      document.uri,
      webviewEditor,
    );
    this._previews.set(preview, resourceKey);
    this.setActivePreview(preview);

    webviewEditor.onDidDispose(() => {
      preview.dispose();
      this._previews.delete(preview);
      if (this._activePreview === preview) {
        this.setActivePreview(undefined);
      }
    });

    webviewEditor.onDidChangeViewState(() => {
      if (webviewEditor.active) {
        this.setActivePreview(preview);
      } else if (this._activePreview === preview && !webviewEditor.active) {
        this.setActivePreview(undefined);
      }
    });
  }

  public get activePreview(): PdfPreview | undefined {
    return this._activePreview;
  }

  public getPreviewLoadState(
    resource: vscode.Uri,
  ): PreviewLoadState | undefined {
    for (const [preview, key] of this._previews) {
      if (key === resource.toString()) {
        return preview.loadState;
      }
    }
    return undefined;
  }

  public get activePreviewLoadState():
    | { status: 'loading' }
    | { status: 'loaded'; pagesCount: number }
    | { status: 'error'; message: string }
    | undefined {
    return this._activePreview?.loadState;
  }

  private setActivePreview(value: PdfPreview | undefined): void {
    this._activePreview = value;
  }
}
