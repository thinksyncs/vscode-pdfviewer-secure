# PDF Viewer Secure

View PDFs offline in VS Code with bundled PDF.js and restrictive defaults. Requires VS Code 1.111 or later.

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=ToppyMicroServices.vscode-pdfviewer-secure), then open a `.pdf` file.

![PDF preview](./assets/Screenshot_readme.png)

After installation, local PDF viewing uses bundled assets and needs no internet connection, including on first launch. CI tests rendering and reloads with external networking disabled; see [offline verification](./docs/offline-testing.md). Copilot model requests, installation downloads, and remote files are outside this offline support.

## Defaults and settings

- External links, file imports, downloads (including attachments), printing, forms, and annotation editing are off by default.
- Enable optional features with `pdf-preview.features.*` in VS Code settings.
- Adjust zoom, cursor, sidebar, and page layout with `pdf-preview.default.*`.
- PDF JavaScript stays disabled, even when forms are enabled.

## Copilot Agent tools

Enable `pdf-preview.agent.enabled` in **User Settings**, then select the tools in Copilot Agent chat:

- `#pdfPreviewOpen`: open a workspace PDF and report its loading status and page count.
- `#pdfPreviewStatus`: check a PDF preview by its absolute file path.

Tools require a trusted local workspace and reject paths outside it, including symlink escapes. They return the path, status, and page count to the chat; they do not extract PDF text or provide OCR. These are VS Code tools, not a standalone MCP server or Agent Plugin.

## Attribution

Based on [tomoki1207/vscode-pdfviewer](https://github.com/tomoki1207/vscode-pdfviewer) and [Mozilla PDF.js](https://github.com/mozilla/pdf.js). Original notices are preserved. Provided as is, without warranty; see [LICENSE](./LICENSE).
