import MarkdownIt, { type MarkdownIt as MarkdownItInstance } from 'markdown-it'
import markdownItLinkAttributes from 'markdown-it-link-attributes'

export interface CreateMarkdownItOptions {
  /** 放行源码里的 HTML 标签；默认 false（放行时调用方仍需自行 DOMPurify） */
  html?: boolean
  /** 自动识别裸链接；默认 true */
  linkify?: boolean
  /** 单个换行转 <br>；默认 false */
  breaks?: boolean
  /** 给所有链接补的属性（markdown-it-link-attributes），如 { target: '_blank', rel: 'noopener noreferrer' } */
  linkAttributes?: Record<string, string>
}

/**
 * 全站 markdown-it 实例的唯一工厂：公共默认集中在此，各调用方只声明差异。
 * KaTeX 等只有个别调用方需要的重型插件由调用方自行 `.use()`，不进工厂，避免带进不需要它的 chunk。
 */
export function createMarkdownIt(options: CreateMarkdownItOptions = {}): MarkdownItInstance {
  const { html = false, linkify = true, breaks = false, linkAttributes } = options
  const md = new MarkdownIt({ html, linkify, breaks })
  // markdown-it 15（linkify-it 6）默认不再识别 www.example.com 这类不带协议的链接，保持原有行为
  md.linkify.set({ fuzzyLink: true })
  if (linkAttributes) md.use(markdownItLinkAttributes, { attrs: linkAttributes })
  return md
}
