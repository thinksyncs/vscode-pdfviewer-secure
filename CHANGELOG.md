# Changelog

## 2.4.0 (2026-09-20)

- Add opt-in Copilot Agent tools to open workspace PDFs and report preview status and page count.
- Restrict agent tools to trusted local workspaces and reject paths or symlinks that escape workspace folders.
- Keep PDF contents out of tool responses and preserve existing viewer defaults without new runtime dependencies.
- Simplify the README and document agent setup.
- Keep VS Code API types compatible with the minimum supported editor version.

## 2.2.0 (2026-09-17)

- Fix viewer startup, receive PDF.js initialization events, and load the bundled worker through a Blob URL.
- Prevent workspace settings from changing executable viewer resource URLs.
- Keep external links disabled across reloads and apply download restrictions to embedded attachments.
- Enforce file-import controls and restore the toolbar controls when their features are enabled.
- Release references to closed previews and preserve view settings across reloads.
- Report asynchronous load failures and allow an explicit reload to recover.
- Remove a duplicate image from the VSIX and refresh vulnerable development dependencies.
- Require VS Code 1.111 or later and verify rendering with isolated extension-host tests.
- Publish the validated VSIX to Marketplace with full dependency audit gates.

## 2.0.5 (2026-03-17)

- Fix VSIX packaging so `parse5` ships as a runtime dependency.
- Keep Marketplace and Open VSX installs aligned with the packaged extension host runtime.

## 2.0.4 (2026-03-14)

- Re-publish the secure release after Marketplace packaging and channel checks.

## 2.0.3 (2026-03-14)

- Add daily pre-release automation for the Marketplace pre-release channel.
- Refresh the secure icon set and align pre-release versioning with the stable channel.

## 2.0.2 (2026-03-14)

- Add CI, daily vulnerability audit, and Dependabot automation.
- Refine Marketplace metadata and add a repository security policy.

## 2.0.1 (2026-03-12)

- Publish the ToppyMicroServices-branded release line.
- Automate stable registry publishing from the GitHub release workflow.

## 2.0.0 (2026-03-12)

- Start the security-first, offline-first ToppyMicroServices fork.
- Harden the bundled PDF.js wrapper with opt-in feature flags and tightened webview defaults.

## Upstream History

The entries below capture the original upstream changelog before the secure fork.

## 1.2.2 (2022/12/23)

- Fix about rendering Unicode characters

## 1.2.1 (2022/12/12)

- Update PDF.js to 3.1.81-legacy
- Restore scroll position during reload (#136)
- Run under remote development (#100)

### Thank you

- @kfigiela Run extension locally when using remote development #100
- @Daniel-Atanasov fix: Fix scroll location and flickering during reload #136

## 1.2.0 (2021/12/15)

- Allow pdf viewer to work in an untrusted workspace (#102)
- Bump version of PDF.js to Stable (v2.10.377) (#120)

### Bug fixes

- Support Unicode in PDF by passing the right cMapUrl to pdf.js (#116)
- Preserve the current page number and zoom level on reload (#121)

### Thank you
- @lramos15 Added settings about untrusted workspaces. #102
- @aifreedom Fixed bug about Unicode charactors. #116
- @simon446 Bump pdf.js version. #120
- @zamzterz Fixed to preserve page number and scale on reload. #121

## 1.1.0 (2020/07/13)

- The issue about extension view is resolved.
  + Remove message shown on loaded. 
- Support default viewer settings
  + cursor (**hand** or tool)
  + scale (**auto**, page-actual, etc...)
  + sidebar (**hide** or show)
  + scrollMode (**vertical**, horizontal or wrapped)
  + spreadMode (**none**, odd or even)

## 1.0.0 (2020/06/18)

- [Change extension API](https://github.com/microsoft/vscode/issues/77131)
- Resolve known issues about showing pdf preview.
- Upgrade PDF.js to 2.4.456

## 0.6.0 (2020/04/10)

- Support auto reload (#52)
- Migrate vscode-extension packages

### Thank you
- @GeorchW Implemented auto-refresh ( #11 )  #52

## 0.5.0 (2019/02/25)

- Recovery for working even VSCode 1.31.x.
- Avoid nested `<iframe>`.

## 0.4.3 (2018/11/28)

- Recovery for working even VSCode 1.30.0.

## 0.4.2 (2018/11/28)

- Revive display state on load VSCode.
- [Event-Stream Package Security Update](https://code.visualstudio.com/blogs/2018/11/26/event-stream)

## 0.4.0 (2018/11/9)

- Migrate vscode internal api. Due to [Microsoft/vscode#62630](https://github.com/Microsoft/vscode/issues/62630)
- Upgrade PDF.js to 2.1.36

## 0.3.0 (2018/6/6)

- Upgrade PDF.js to 1.9.426 (#23)

### Thank you
- @Kampfgnom bump to pdf.js version #23

## 0.2.0 (2017/1/12)

- Fixed displaying on linux (#5)
- Be able to open PDF from context menu in explorer now (#6)

### Thank you
- @serl support for context menu in explorer #6

## 0.1.0 (2016/11/30)

- Add extension icon.
- Use all PDF.js [Pre-built](https://mozilla.github.io/pdf.js/getting_started/#download) files.

## 0.0.2 (2016/11/24)

- consistent file icon

## 0.0.1 (2016/10/25)

- Initial release.
