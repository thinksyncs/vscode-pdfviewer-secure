import * as vscode from 'vscode';
import { assertAgentAccess, resolveWorkspacePdfPath } from './agentAccess';
import { PreviewLoadState } from './pdfPreview';
import { PdfCustomProvider } from './pdfProvider';

interface PdfToolInput {
  path: string;
}

function checkAccess(token: vscode.CancellationToken): void {
  if (token.isCancellationRequested) {
    throw new vscode.CancellationError();
  }
  assertAgentAccess(
    vscode.workspace.getConfiguration('pdf-preview').get('agent.enabled'),
    vscode.workspace.isTrusted,
  );
}

function pause(token: vscode.CancellationToken): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      resolve();
    }, 100);
    const subscription = token.onCancellationRequested(() => {
      clearTimeout(timer);
      subscription.dispose();
      reject(new vscode.CancellationError());
    });
  });
}

export class PdfAgentTool implements vscode.LanguageModelTool<PdfToolInput> {
  constructor(
    private readonly getState: (
      uri: vscode.Uri,
    ) => PreviewLoadState | undefined,
    private readonly open: boolean,
  ) {}

  private async resolveInput(
    input: PdfToolInput,
    token: vscode.CancellationToken,
  ): Promise<vscode.Uri> {
    checkAccess(token);
    const roots = (vscode.workspace.workspaceFolders ?? [])
      .filter((folder) => folder.uri.scheme === 'file')
      .map((folder) => folder.uri.fsPath);
    const resolved = await resolveWorkspacePdfPath(input?.path, roots);
    checkAccess(token);
    return vscode.Uri.file(resolved);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<PdfToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const uri = await this.resolveInput(options.input, token);
    const action = this.open ? 'Open PDF preview' : 'Get PDF preview status';
    return {
      invocationMessage: action,
      confirmationMessages: {
        title: action,
        message: new vscode.MarkdownString().appendText(
          `${action} for ${uri.fsPath}? Only the path, loading status, and page count are returned to the agent; PDF text is not extracted.`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PdfToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    // Revalidate here: preparation may have been skipped or settings changed.
    const uri = await this.resolveInput(options.input, token);
    if (this.open) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        PdfCustomProvider.viewType,
        { preview: false, preserveFocus: true },
      );
    }
    const deadline = Date.now() + 30000;
    let state = this.getState(uri);
    while (this.open && state?.status === 'loading' && Date.now() < deadline) {
      checkAccess(token);
      await pause(token);
      state = this.getState(uri);
    }
    checkAccess(token);
    // Do not forward document-controlled error strings to a language model.
    const metadata =
      state?.status === 'loaded' &&
      Number.isSafeInteger(state.pagesCount) &&
      state.pagesCount > 0
        ? { status: 'loaded', pagesCount: state.pagesCount }
        : {
            status:
              state?.status === 'loaded'
                ? 'error'
                : (state?.status ?? 'not_open'),
          };
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        JSON.stringify({ path: uri.fsPath, ...metadata }),
      ),
    ]);
  }
}

export function registerPdfAgentTools(
  context: vscode.ExtensionContext,
  provider: PdfCustomProvider,
): void {
  const getState = (uri: vscode.Uri) => provider.getPreviewLoadState(uri);
  context.subscriptions.push(
    vscode.lm.registerTool(
      'pdf_preview_open',
      new PdfAgentTool(getState, true),
    ),
    vscode.lm.registerTool(
      'pdf_preview_status',
      new PdfAgentTool(getState, false),
    ),
  );
}
