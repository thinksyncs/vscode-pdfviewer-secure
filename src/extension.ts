import * as vscode from 'vscode';
import { PdfCustomProvider } from './pdfProvider';

export interface PdfPreviewExtensionApi {
  getActivePreviewLoadState: () =>
    | { status: 'loading' }
    | { status: 'loaded'; pagesCount: number }
    | { status: 'error'; message: string }
    | undefined;
}

export function activate(
  context: vscode.ExtensionContext,
): PdfPreviewExtensionApi {
  const extensionRoot = vscode.Uri.file(context.extensionPath);
  const provider = new PdfCustomProvider(extensionRoot);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pdf-preview._getActivePreviewLoadState',
      () => provider.activePreviewLoadState,
    ),
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PdfCustomProvider.viewType,
      provider,
      {
        webviewOptions: {
          enableFindWidget: false, // default
          retainContextWhenHidden: true,
        },
      },
    ),
  );

  return {
    getActivePreviewLoadState: () => provider.activePreviewLoadState,
  };
}

export function deactivate(): void {}
