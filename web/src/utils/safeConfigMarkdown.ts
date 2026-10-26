import DOMPurify from 'dompurify'

export function sanitizeConfigMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html || '', {
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
    FORBID_ATTR: ['srcdoc'],
  })
}
