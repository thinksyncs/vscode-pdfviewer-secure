import * as vscode from 'vscode';
import { PdfPreview } from './pdfPreview';

export class PdfCustomProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'vscode-pdfviewer.preview';

  private readonly _previews = new Set<PdfPreview>();
  private _activePreview: PdfPreview | undefined;

  constructor(private readonly extensionRoot: vscode.Uri) {}

  public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: (): void => {} };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewEditor: vscode.WebviewPanel,
  ): Promise<void> {
    const preview = new PdfPreview(
      this.extensionRoot,
      document.uri,
      webviewEditor,
    );
    this._previews.add(preview);
    this.setActivePreview(preview);

    webviewEditor.onDidDispose(() => {
      preview.dispose();
      this._previews.delete(preview);
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
