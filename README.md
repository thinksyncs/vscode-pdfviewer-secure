# VSCode PDF Viewer Secure

Security-first, offline-first PDF viewer for VS Code business environments with reduced telemetry exposure.

![screenshot](https://user-images.githubusercontent.com/3643499/84454816-98fcd600-ac96-11ea-822c-3ae1e1599a13.gif)

## Update

- Business-oriented secure fork: this project is maintained as a hardened fork for organizations that want to use VS Code with a more controlled local PDF preview surface.
- Offline-first: PDF rendering and bundled viewer assets stay inside the extension, so local documents can be opened without depending on external services.
- Security first: the viewer runs under a restrictive webview CSP, disables PDF scripting, and keeps external link handling locked down by default.
- Telemetry less: the extension does not add its own telemetry pipeline and avoids unnecessary network-connected integrations in the preview flow.

## Security Posture

- Default mode is read-only and opt-in: external links, open-file, download, print, document properties, current-view links, forms, and annotation editing all default to `off`.
- PDF.js runs inside a VS Code webview with a restrictive CSP, bundled assets only, disabled scripting, and disabled `eval`.
- The extension does not spawn shells or child processes for previewing PDFs.

## Configuration

- `pdf-preview.features.externalLinks`
- `pdf-preview.features.openFile`
- `pdf-preview.features.download`
- `pdf-preview.features.print`
- `pdf-preview.features.documentProperties`
- `pdf-preview.features.currentView`
- `pdf-preview.features.forms`
- `pdf-preview.features.annotationEditing`

All feature flags default to `false`. Enable only what your workspace actually needs.

## Disclaimer

This project is developed with a security-first and offline-first posture, but no software can guarantee the absence of defects, vulnerabilities, service interruptions, or user harm.

By using this extension, you accept that it is provided on an `as is` and `as available` basis, without warranties of any kind, and the authors and contributors are not liable for damages, losses, incidents, or claims arising from its use.

If you need formal assurance, legal commitments, or incident response guarantees, you should complete your own security review and operational validation before deploying it in a business environment.

## Attribution

This project is based on `tomoki1207/vscode-pdfviewer` and uses Mozilla PDF.js.
Original license notices and attribution are preserved in this repository.

## Contribute

### Upgrade PDF.js

1. Download the latest `pdfjs-*-legacy-dist.zip` from the official [PDF.js releases](https://github.com/mozilla/pdf.js/releases).
1. Extract the ZIP file.
1. Overwrite `./lib/*` with the extracted `build/*`, `web/*`, and `LICENSE`.
   - `lib/web/viewer.html` is used as the source template at runtime. Keep local changes in `lib/pdf.css`, `src/viewerTemplate.ts`, and `src/webview/main.ts`.
1. The extension overrides `defaultUrl` and the resource paths at runtime, so no manual patching of `viewer.mjs` is needed.
1. Run `npm run compile` and `npm run test:unit` after upgrading to catch template rewrite regressions.
1. Run `npm run test:integration` when you want to smoke-test the custom editor in an extension host.

## Change log
See `CHANGELOG.md`.

## License
Please see `LICENSE`.
