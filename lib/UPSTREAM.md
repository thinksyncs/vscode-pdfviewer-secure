# Bundled PDF.js

- Version: 5.5.207 (legacy distribution), build `527964698`.
- Source: https://github.com/mozilla/pdf.js/releases/tag/v5.5.207
- Archive: `pdfjs-5.5.207-legacy-dist.zip`.
- The upstream sample PDF is omitted. `pdf.css` contains this extension's wrapper styles.
- Upstream executable files are unchanged. Feature restrictions are applied by `src/webview/main.ts`.

PDF.js is vendored, so `npm audit` does not cover it. Check Mozilla's security advisories and verify the official distribution before updating it. Keep the viewer, worker, and resources on the same upstream version, then run the extension-host and packaged-VSIX tests.
