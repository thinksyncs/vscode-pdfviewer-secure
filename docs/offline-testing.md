# Offline support

Local PDF viewing with the default settings must work after VS Code and the extension are installed, including a first launch without internet access. PDF.js, its worker, character maps, standard fonts, image decoders, and locale files are bundled. No prior document or web cache is required.

External links and saving PDFs or embedded attachments are disabled by default. PDF JavaScript remains disabled. These restrictions are tested separately by the wrapper policy unit tests. Enabling an external link does not make its destination available offline.

Copilot model requests, extension installation or updates, and files that still need downloading from a cloud or remote workspace are outside this scope. The viewer does not control networking by VS Code itself or other installed extensions. Offline support is not a guarantee that every malformed or unsupported PDF will render.

## Verification

`npm run test:offline` prepares a VS Code installation, then starts Xvfb and VS Code inside a fresh Linux network namespace with only loopback enabled. It requires a non-root user with passwordless sudo, `unshare`, `ip`, `runuser`, and `xvfb-run`, as provided by the Ubuntu CI runners. It does not change the host's network settings.

Inside the actual extension host, checks before and after the test suite verify:

- The namespace differs from the host and has only the loopback interface.
- Loopback connections work, while direct external IPv4 and IPv6 connections fail with an unreachable-route error.
- VS Code runs without root privileges.

Each run creates a new profile, extension directory, and local fixture workspace. The rendering tests cover text, a compressed image, a Japanese character map, multiple pages, file reloads, malformed-file errors, and editor disposal. Agent tool tests exercise their local implementation without contacting a model. Passing a page-render event does not establish pixel-perfect fidelity or coverage of every PDF feature.

Validation runs on the minimum supported VS Code version and current stable on Linux. Every release path also tests the unpacked VSIX offline before publishing. Windows and macOS run unit tests; the network-isolation result does not establish offline GUI behavior on those systems.

To check an already published artifact, dispatch **Validate and Package VSIX** with `published_version` set to its numeric version. The job downloads that exact Marketplace VSIX, checks its identity and archive integrity, records its SHA-256, and runs it offline on both VS Code versions. Downloads happen before network isolation.
