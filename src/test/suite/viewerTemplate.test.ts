import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createViewerHtml } from '../../viewerTemplate';

suite('viewerTemplate', () => {
  const baseTemplate = `<!DOCTYPE html>
<html dir="ltr">
  <head>
    <meta charset="utf-8">
    <title>PDF.js viewer</title>
    <link rel="stylesheet" href="viewer.css">
    <link rel="resource" type="application/l10n" href="locale/locale.json">
    <script src="../build/pdf.mjs" type="module"></script>
    <script src="viewer.mjs" type="module"></script>
  </head>
  <body>
    <a href="#">anchor</a>
    <a href="https://support.mozilla.org/en-US/kb/pdf-alt-text">external</a>
  </body>
</html>`;

  test('rewrites viewer assets and injects preview assets', () => {
    const html = createViewerHtml(baseTemplate, {
      cspSource: 'vscode-webview://preview',
      resolveAssetUri: (assetPath) => `webview:${assetPath}`,
      serializedConfig: '{"path":"file:///tmp/sample.pdf"}',
      allowExternalLinks: false,
    });

    assert.ok(html.includes('href="webview:lib/web/viewer.css"'));
    assert.ok(html.includes('href="webview:lib/web/locale/locale.json"'));
    assert.ok(html.includes('src="webview:lib/build/pdf.mjs"'));
    assert.ok(html.includes('src="webview:lib/web/viewer.mjs"'));
    assert.ok(html.includes('href="webview:lib/pdf.css"'));
    assert.ok(html.includes('src="webview:out/src/webview/main.js"'));
    assert.ok(html.includes('connect-src vscode-webview://preview;'));
    assert.ok(html.includes('script-src vscode-webview://preview;'));
    assert.ok(html.includes("script-src-attr 'none';"));
    assert.ok(html.includes('style-src vscode-webview://preview;'));
    assert.ok(html.includes("style-src-attr 'unsafe-inline';"));
    assert.ok(!html.includes("script-src 'unsafe-inline'"));
    assert.ok(html.includes('worker-src blob: vscode-webview://preview;'));
    assert.ok(html.includes('href="#"'));
    assert.ok(!html.includes('https://support.mozilla.org'));
  });

  test('escapes config before embedding it as an attribute', () => {
    const html = createViewerHtml(baseTemplate, {
      cspSource: 'vscode-webview://preview',
      resolveAssetUri: (assetPath) => `webview:${assetPath}`,
      serializedConfig: '{"path":"file:///tmp/\\"quoted\\".pdf"}',
      allowExternalLinks: false,
    });

    assert.ok(
      html.includes(
        '&quot;path&quot;:&quot;file:///tmp/\\&quot;quoted\\&quot;.pdf&quot;',
      ),
    );
  });

  test('neutralizes external links from upstream viewer markup', () => {
    const html = createViewerHtml(baseTemplate, {
      cspSource: 'vscode-webview://preview',
      resolveAssetUri: (assetPath) => `webview:${assetPath}`,
      serializedConfig: '{"path":"file:///tmp/sample.pdf"}',
      allowExternalLinks: false,
    });

    assert.ok(html.includes('<a href="#">external</a>'));
    assert.ok(!html.includes('href="https://support.mozilla.org'));
  });

  test('removes external hrefs from the bundled upstream viewer', () => {
    const upstreamTemplate = fs.readFileSync(
      path.resolve(__dirname, '../../../../lib/web/viewer.html'),
      'utf8',
    );
    const html = createViewerHtml(upstreamTemplate, {
      cspSource: 'vscode-webview://preview',
      resolveAssetUri: (assetPath) => `webview:${assetPath}`,
      serializedConfig: '{"path":"file:///tmp/sample.pdf"}',
      allowExternalLinks: false,
    });

    assert.ok(!html.includes('href="https://'));
    assert.ok(!html.includes('href="http://'));
  });

  test('preserves external links when explicitly enabled', () => {
    const html = createViewerHtml(baseTemplate, {
      cspSource: 'vscode-webview://preview',
      resolveAssetUri: (assetPath) => `webview:${assetPath}`,
      serializedConfig: '{"path":"file:///tmp/sample.pdf"}',
      allowExternalLinks: true,
    });

    assert.ok(
      html.includes('href="https://support.mozilla.org/en-US/kb/pdf-alt-text"'),
    );
  });

  test('rewrites single-quoted upstream attributes without regex assumptions', () => {
    const singleQuotedTemplate = `<!DOCTYPE html>
<html dir='ltr'>
  <head>
    <link rel='stylesheet' href='viewer.css'>
    <script src='../build/pdf.mjs' type='module'></script>
  </head>
  <body>
    <a href='https://example.com'>external</a>
  </body>
</html>`;

    const html = createViewerHtml(singleQuotedTemplate, {
      cspSource: 'vscode-webview://preview',
      resolveAssetUri: (assetPath) => `webview:${assetPath}`,
      serializedConfig: '{"path":"file:///tmp/sample.pdf"}',
      allowExternalLinks: false,
    });

    assert.ok(html.includes('href="webview:lib/web/viewer.css"'));
    assert.ok(html.includes('src="webview:lib/build/pdf.mjs"'));
    assert.ok(html.includes('<a href="#">external</a>'));
  });
});
