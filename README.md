# VSCode PDF Viewer Secure

Security-first, offline-first PDF viewer for VS Code.

This is a hardened fork for business environments.

![PDF preview](./assets/Screenshot_readme.png)

- Offline-first
- Security-first
- Reduced telemetry exposure

## Security Posture

- Read-only by default
- Feature flags default to `false`
- Restrictive webview CSP
- PDF scripting disabled
- No shell or child-process execution

## Configuration

All feature flags default to `false`.

- `pdf-preview.features.externalLinks`
- `pdf-preview.features.openFile`
- `pdf-preview.features.download`
- `pdf-preview.features.print`
- `pdf-preview.features.documentProperties`
- `pdf-preview.features.currentView`
- `pdf-preview.features.forms`
- `pdf-preview.features.annotationEditing`

## Disclaimer

This project is developed with a security-first and offline-first posture.
However, no software can guarantee the absence of defects, vulnerabilities, outages, or damage.

It is provided `as is`, without warranty.
The authors and contributors are not liable for losses, damages, incidents, or claims arising from its use.

Run your own security review before business deployment.

## Attribution

This project is based on `tomoki1207/vscode-pdfviewer` and uses Mozilla PDF.js.
Original license notices and attribution are preserved in this repository.

## Contribute

### Upgrade PDF.js

1. Download the latest `pdfjs-*-legacy-dist.zip` from the official [PDF.js releases](https://github.com/mozilla/pdf.js/releases).
1. Extract the ZIP file.
1. Overwrite `./lib/*` with the extracted `build/*`, `web/*`, and `LICENSE`.
1. Keep local changes in `lib/pdf.css`, `src/viewerTemplate.ts`, and `src/webview/main.ts`.
1. Run `npm run compile` and `npm run test:unit`.

## Change log
See `CHANGELOG.md`.

## License
Please see `LICENSE`.
