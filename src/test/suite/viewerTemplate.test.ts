import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createViewerHtml } from '../../viewerTemplate';

interface ParsedNode {
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: ParsedNode[];
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const parse5 = require('parse5') as { parse: (html: string) => ParsedNode };

function findNodes(node: ParsedNode, tagName: string): ParsedNode[] {
  return [
    ...(node.tagName === tagName ? [node] : []),
    ...(node.childNodes ?? []).flatMap((child) => findNodes(child, tagName)),
  ];
}

function attribute(node: ParsedNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name === name)?.value;
}

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
    assert.ok(html.includes("style-src-attr 'none';"));
    assert.ok(!html.includes("script-src 'unsafe-inline'"));
    assert.ok(html.includes('worker-src blob: vscode-webview://preview;'));
    assert.ok(html.includes('href="#"'));
    assert.deepStrictEqual(
      findNodes(parse5.parse(html), 'a').map((node) => attribute(node, 'href')),
      ['#', '#'],
    );
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
    assert.deepStrictEqual(
      findNodes(parse5.parse(html), 'a').map((node) => attribute(node, 'href')),
      ['#', '#'],
    );
  });

  test('preserves JSON exactly across HTML character-reference decoding', () => {
    for (const quote of ['&quot;', '&#34;', '&#x22;']) {
      const config = {
        workerSrc: 'webview:lib/build/pdf.worker.mjs',
        features: { externalLinks: false },
        defaults: {
          scale: `auto${quote}},${quote}workerSrc${quote}:${quote}INJECTED${quote},${quote}extra${quote}:{${quote}key${quote}:${quote}value`,
        },
        ordinaryText: 'A&B <tag> "quoted" &amp; &apos; 日本語',
      };
      const html = createViewerHtml(baseTemplate, {
        cspSource: 'vscode-webview://preview',
        resolveAssetUri: (assetPath) => `webview:${assetPath}`,
        serializedConfig: JSON.stringify(config),
        allowExternalLinks: false,
      });
      const meta = findNodes(parse5.parse(html), 'meta').find(
        (node) => attribute(node, 'id') === 'pdf-preview-config',
      );
      assert.ok(meta);
      assert.deepStrictEqual(
        JSON.parse(attribute(meta, 'data-config') ?? ''),
        config,
      );
    }
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

  test('removes static inline styles from the upstream template', () => {
    const styledTemplate = `<!DOCTYPE html>
<html dir="ltr">
  <head>
    <link rel="stylesheet" href="viewer.css">
  </head>
  <body>
    <dialog id="printServiceDialog" style="min-width: 200px"></dialog>
  </body>
</html>`;

    const html = createViewerHtml(styledTemplate, {
      cspSource: 'vscode-webview://preview',
      resolveAssetUri: (assetPath) => `webview:${assetPath}`,
      serializedConfig: '{"path":"file:///tmp/sample.pdf"}',
      allowExternalLinks: false,
    });

    assert.ok(html.includes('id="printServiceDialog"'));
    assert.ok(!html.includes('style="min-width: 200px"'));
  });
});
