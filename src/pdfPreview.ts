import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CursorTool,
  PreviewDefaults,
  PreviewFeatures,
  PREVIEW_RUNTIME_VALUES,
  PreviewWebviewSettings,
  ScrollMode,
  SpreadMode,
  resolvePreviewFeatures,
} from './config';
import { Disposable } from './disposable';
import { createViewerHtml } from './viewerTemplate';

type PreviewState = 'Disposed' | 'Visible' | 'Active';
type PreviewLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; pagesCount: number }
  | { status: 'error'; message: string };

type WebviewMessage =
  | { type: 'reopen-as-text' }
  | { type: 'document-loaded'; pagesCount: number }
  | { type: 'document-error'; message: string };

export class PdfPreview extends Disposable {
  private static _viewerTemplate: string | undefined;
  private _previewState: PreviewState = 'Visible';
  private _loadState: PreviewLoadState = { status: 'loading' };

  constructor(
    private readonly extensionRoot: vscode.Uri,
    private readonly resource: vscode.Uri,
    private readonly webviewEditor: vscode.WebviewPanel,
  ) {
    super();
    const resourceRoot = vscode.Uri.joinPath(resource, '..');

    webviewEditor.webview.options = {
      enableScripts: true,
      localResourceRoots: [resourceRoot, extensionRoot],
    };

    this._register(
      webviewEditor.webview.onDidReceiveMessage((message: WebviewMessage) => {
        switch (message.type) {
          case 'reopen-as-text': {
            vscode.commands.executeCommand(
              'vscode.openWith',
              resource,
              'default',
              webviewEditor.viewColumn,
            );
            break;
          }
          case 'document-loaded': {
            this._loadState = {
              status: 'loaded',
              pagesCount: message.pagesCount,
            };
            break;
          }
          case 'document-error': {
            this._loadState = {
              status: 'error',
              message: message.message,
            };
            break;
          }
        }
      }),
    );

    this._register(
      webviewEditor.onDidChangeViewState(() => {
        this.update();
      }),
    );

    this._register(
      webviewEditor.onDidDispose(() => {
        this._previewState = 'Disposed';
      }),
    );

    const watcher = this._register(
      vscode.workspace.createFileSystemWatcher(resource.fsPath),
    );
    this._register(
      watcher.onDidChange((e) => {
        if (e.toString() === this.resource.toString()) {
          this.reload();
        }
      }),
    );
    this._register(
      watcher.onDidDelete((e) => {
        if (e.toString() === this.resource.toString()) {
          this.webviewEditor.dispose();
        }
      }),
    );

    this.webviewEditor.webview.html = this.getWebviewContents();
    this.update();
  }

  private reload(): void {
    if (this._previewState !== 'Disposed') {
      this._loadState = { status: 'loading' };
      this.webviewEditor.webview.postMessage({ type: 'reload' });
    }
  }

  private update(): void {
    if (this._previewState === 'Disposed') {
      return;
    }

    if (this.webviewEditor.active) {
      this._previewState = 'Active';
      return;
    }
    this._previewState = 'Visible';
  }

  public get loadState(): PreviewLoadState {
    return this._loadState;
  }

  private getFeatures(config: vscode.WorkspaceConfiguration): PreviewFeatures {
    return resolvePreviewFeatures((settingName) =>
      config.get<boolean>(settingName),
    );
  }

  private getWebviewContents(): string {
    const webview = this.webviewEditor.webview;
    const docPath = webview.asWebviewUri(this.resource);
    const cspSource = webview.cspSource;
    const resolveAssetUri = (assetPath: string): string => {
      const uri = vscode.Uri.file(
        path.join(this.extensionRoot.fsPath, assetPath),
      );
      return webview.asWebviewUri(uri).toString();
    };

    const config = vscode.workspace.getConfiguration('pdf-preview');
    const features = this.getFeatures(config);
    const defaults: PreviewDefaults = {
      cursor: config.get('default.cursor') as CursorTool,
      scale: config.get('default.scale') as string,
      sidebar: config.get('default.sidebar') as boolean,
      scrollMode: config.get('default.scrollMode') as ScrollMode,
      spreadMode: config.get('default.spreadMode') as SpreadMode,
    };

    const settings: PreviewWebviewSettings = {
      cMapUrl: `${resolveAssetUri(path.posix.join('lib', 'web', 'cmaps'))}/`,
      iccUrl: `${resolveAssetUri(path.posix.join('lib', 'web', 'iccs'))}/`,
      imageResourcesPath: `${resolveAssetUri(
        path.posix.join('lib', 'web', 'images'),
      )}/`,
      runtime: PREVIEW_RUNTIME_VALUES,
      sandboxBundleSrc: resolveAssetUri(
        path.posix.join('lib', 'build', 'pdf.sandbox.mjs'),
      ),
      standardFontDataUrl:
        resolveAssetUri(path.posix.join('lib', 'web', 'standard_fonts')) + '/',
      wasmUrl: `${resolveAssetUri(path.posix.join('lib', 'web', 'wasm'))}/`,
      workerSrc: resolveAssetUri(
        path.posix.join('lib', 'build', 'pdf.worker.mjs'),
      ),
      path: docPath.toString(),
      features,
      defaults,
    };

    return createViewerHtml(this.getViewerTemplate(), {
      cspSource,
      resolveAssetUri,
      serializedConfig: JSON.stringify(settings),
      allowExternalLinks: features.externalLinks,
    });
  }

  private getViewerTemplate(): string {
    if (!PdfPreview._viewerTemplate) {
      const templatePath = path.join(
        this.extensionRoot.fsPath,
        'lib',
        'web',
        'viewer.html',
      );
      PdfPreview._viewerTemplate = fs.readFileSync(templatePath, 'utf8');
    }

    return PdfPreview._viewerTemplate;
  }
}
