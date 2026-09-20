import * as vscode from 'vscode';
import { PdfCustomProvider } from './pdfProvider';
import { PreviewLoadState } from './pdfPreview';
import { registerPdfAgentTools } from './agentTools';

export interface PdfPreviewExtensionApi {
  getPreviewLoadState: (resource: vscode.Uri) => PreviewLoadState | undefined;
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

  registerPdfAgentTools(context, provider);

  return {
    getPreviewLoadState: (resource) => provider.getPreviewLoadState(resource),
    getActivePreviewLoadState: () => provider.activePreviewLoadState,
  };
}

export function deactivate(): void {}
