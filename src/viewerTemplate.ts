import * as path from 'path';
const parse5 = require('parse5') as {
  parse: (html: string) => HtmlDocument;
  parseFragment: (contextNode: HtmlNode, html: string) => HtmlFragment;
  serialize: (node: HtmlNode) => string;
};

const VIEWER_TEMPLATE_PATH = path.posix.join('lib', 'web', 'viewer.html');
const VIEWER_TEMPLATE_DIR = path.posix.dirname(VIEWER_TEMPLATE_PATH);
const ABSOLUTE_URI_SCHEME = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const HTTP_URI_SCHEME = /^https?:/i;

interface HtmlAttribute {
  name: string;
  value: string;
}

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
}

interface HtmlDocument extends HtmlNode {}

interface HtmlFragment extends HtmlNode {
  childNodes: HtmlNode[];
}

export interface ViewerHtmlOptions {
  cspSource: string;
  resolveAssetUri: (assetPath: string) => string;
  serializedConfig: string;
  allowExternalLinks: boolean;
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function isLocalAssetPath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith('#') &&
    !ABSOLUTE_URI_SCHEME.test(value)
  );
}

function rewriteTemplateAssetUrls(
  document: HtmlDocument,
  resolveAssetUri: (assetPath: string) => string,
  allowExternalLinks: boolean,
): HtmlNode | undefined {
  let headNode: HtmlNode | undefined;

  const visit = (node: HtmlNode): void => {
    if (node.tagName === 'head') {
      headNode = node;
    }

    for (const attribute of node.attrs ?? []) {
      if (
        attribute.name === 'href' &&
        HTTP_URI_SCHEME.test(attribute.value) &&
        !allowExternalLinks
      ) {
        attribute.value = '#';
        continue;
      }

      if (
        (attribute.name === 'href' || attribute.name === 'src') &&
        isLocalAssetPath(attribute.value)
      ) {
        const assetPath = path.posix.normalize(
          path.posix.join(VIEWER_TEMPLATE_DIR, attribute.value),
        );
        attribute.value = resolveAssetUri(assetPath);
      }
    }

    for (const childNode of node.childNodes ?? []) {
      visit(childNode);
    }
  };

  visit(document);
  return headNode;
}

export function createViewerHtml(
  viewerHtml: string,
  options: ViewerHtmlOptions,
): string {
  const document = parse5.parse(viewerHtml);
  const headNode = rewriteTemplateAssetUrls(
    document,
    options.resolveAssetUri,
    options.allowExternalLinks,
  );
  if (!headNode) {
    throw new Error('Unexpected viewer.html format.');
  }

  const headInjection = [
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; object-src 'none'; connect-src ${options.cspSource}; script-src ${options.cspSource}; script-src-elem ${options.cspSource}; script-src-attr 'none'; style-src ${options.cspSource}; style-src-elem ${options.cspSource}; style-src-attr 'unsafe-inline'; img-src blob: data: ${options.cspSource}; font-src ${options.cspSource}; worker-src blob: ${options.cspSource};">`,
    `<meta id="pdf-preview-config" data-config="${escapeAttribute(
      options.serializedConfig,
    )}">`,
  ].join('\n');

  const tailInjection = [
    `<link rel="stylesheet" href="${escapeAttribute(
      options.resolveAssetUri(path.posix.join('lib', 'pdf.css')),
    )}">`,
    `<script src="${escapeAttribute(
      options.resolveAssetUri(path.posix.join('out', 'src', 'webview', 'main.js')),
    )}"></script>`,
  ].join('\n');
  const prependFragment = parse5.parseFragment(headNode, headInjection);
  const appendFragment = parse5.parseFragment(headNode, tailInjection);
  headNode.childNodes = [
    ...prependFragment.childNodes,
    ...(headNode.childNodes ?? []),
    ...appendFragment.childNodes,
  ];

  return parse5.serialize(document);
}
