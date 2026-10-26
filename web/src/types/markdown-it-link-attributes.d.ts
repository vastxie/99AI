declare module 'markdown-it-link-attributes' {
  import type { MarkdownIt } from 'markdown-it'
  const plugin: (md: MarkdownIt, options?: { attrs?: Record<string, string> }) => void
  export default plugin
}
