import DOMPurify from 'dompurify';
import { marked } from 'marked';

const SAFE_URL_RE = /^(https?:|mailto:|tel:|\/(?!\/)|#)/iu;
const URL_ATTRS = ['href', 'src', 'xlink:href'];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof Element)) return;

  for (const attr of URL_ATTRS) {
    const value = node.getAttribute(attr);
    if (value && !SAFE_URL_RE.test(value.trim())) {
      node.removeAttribute(attr);
    }
  }

  node.removeAttribute('srcset');

  if (node instanceof HTMLAnchorElement) {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderSafeMarkdown(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const html = marked.parse(text, {
    gfm: true,
    pedantic: false,
    async: false,
  }) as string;

  return DOMPurify.sanitize(html, {
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
      'meta',
      'link',
    ],
    FORBID_ATTR: ['style', 'srcdoc'],
  });
}
