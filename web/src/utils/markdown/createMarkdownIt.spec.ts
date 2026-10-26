import mdKatex from '@traptitech/markdown-it-katex'
import katex from 'katex'
import MarkdownIt, { type MarkdownItOptions } from 'markdown-it'
import markdownItLinkAttributes from 'markdown-it-link-attributes'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMarkdownIt } from './createMarkdownIt'
import { markdownItMath } from './markdownItMath'

const SAMPLE = [
  '# Title',
  '',
  'Para with **bold**, `code`, bare link https://example.com/path?x=1&y=2 and [text](https://example.org/a).',
  'Second line after a single newline.',
  '',
  '<b>raw html</b> <script>alert(1)</script>',
  '',
  '- item 1',
  '- item 2',
  '',
  '```js',
  'const a = 1 < 2 && "q"',
  '```',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '> quote',
  '',
  'Inline $E=mc^2$ and block:',
  '',
  '$$',
  '\\int_0^1 x^2 dx',
  '$$',
  '',
  'Text with <, >, & and "quotes". www.example.net trailing.',
  '',
].join('\n')

const INLINE_SAMPLE = 'Inline **bold** with https://example.com/x and <i>tag</i>\nnext line'

/**
 * 改造前用五处原始 `new MarkdownIt(...)` 配置对 SAMPLE / INLINE_SAMPLE 的渲染结果 SHA-256
 * （改造前脚本采集），工厂产物必须逐字节一致。
 * messageText 含 KaTeX 输出：katex 0.16.47 起 em 数值保留 4 位小数（0.05764em → 0.0576em），
 * 2026-09-24 升级时按新版重录；工厂与原始配置的逐字节一致仍由用例内的 toBe(legacy) 直接断言。
 */
const BASELINE_DIGESTS = {
  filePreviewPanel: '4cc1e40a443afd9b9bb714627ae0e4bccfc793c97903c3b9e69de4be80e59642',
  safeMarkdownPreview: 'e43e91ce8474ce13cf782fc20a7027106ce724f4736aa7331bc46cdfac6d4c3f',
  messageText: 'def602fe6119f4501c67a3490a4e40ebf7766eb2a432183f9065be3af3505c63',
  toolExecutionDetailInline: 'a3da11101499b3d2349290698d019d801b2d5439d64cc98fd62b60c5c2358012',
  toolExecutionDetail: '4cc1e40a443afd9b9bb714627ae0e4bccfc793c97903c3b9e69de4be80e59642',
  codePreviewSurface: 'f68dd4272724047f39b867a342ad63b81a7cb5e28019b5a06912c8ae1190bd34',
}

const KATEX_OPTIONS = {
  blockClass: 'katexmath-block p-0 flex h-full items-center justify-start',
  inlineClass: 'katexmath-inline',
  errorColor: 'var(--semantic-danger)',
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** 改造前的原始配置跑在 markdown-it 14 上，默认识别 www. 裸链接；15 起需显式打开才与原配置等价 */
const legacyMarkdownIt = (options: MarkdownItOptions) => {
  const md = new MarkdownIt(options)
  md.linkify.set({ fuzzyLink: true })
  return md
}

describe('createMarkdownIt 工厂与五处原始配置逐字节等价', () => {
  it('文件预览面板：html 关、linkify、breaks', () => {
    const html = createMarkdownIt({ breaks: true }).render(SAMPLE)
    expect(html).toBe(legacyMarkdownIt({ html: false, linkify: true, breaks: true }).render(SAMPLE))
    expect(sha256(html)).toBe(BASELINE_DIGESTS.filePreviewPanel)
    expect(html).toContain('<br>')
    expect(html).toContain('&lt;b&gt;raw html&lt;/b&gt;')
    expect(html).not.toContain('target=')
  })

  it('配置类 Markdown 预览：html 开、breaks、链接补 target 与 rel="noopener noreferrer"', () => {
    const html = createMarkdownIt({
      html: true,
      breaks: true,
      linkAttributes: { target: '_blank', rel: 'noopener noreferrer' },
    }).render(SAMPLE)
    const legacy = legacyMarkdownIt({ html: true, linkify: true, breaks: true }).use(
      markdownItLinkAttributes,
      { attrs: { target: '_blank', rel: 'noopener noreferrer' } }
    )
    expect(html).toBe(legacy.render(SAMPLE))
    expect(sha256(html)).toBe(BASELINE_DIGESTS.safeMarkdownPreview)
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('<b>raw html</b>')
  })

  it('消息正文：html 关、linkify，链接 rel="noopener"（不带 noreferrer），公式由调用方挂载（KaTeX 已加载时与原插件逐字节一致）', () => {
    const md = createMarkdownIt({ linkAttributes: { target: '_blank', rel: 'noopener' } })
    md.use(markdownItMath, {
      katex: () => katex,
      blockClass: KATEX_OPTIONS.blockClass,
      katexOptions: { errorColor: KATEX_OPTIONS.errorColor },
    })
    const legacy = legacyMarkdownIt({ linkify: true, html: false })
    legacy.use(markdownItLinkAttributes, { attrs: { target: '_blank', rel: 'noopener' } })
    legacy.use(mdKatex, KATEX_OPTIONS)
    const html = md.render(SAMPLE)
    expect(html).toBe(legacy.render(SAMPLE))
    expect(sha256(html)).toBe(BASELINE_DIGESTS.messageText)
    expect(html).toContain('rel="noopener"')
    expect(html).not.toContain('noreferrer')
    expect(html).not.toContain('<br>')
    expect(html).toContain('katexmath-block')
    expect(html).toContain('class="katex"')
  })

  it('工具详情：html 关、linkify、breaks，renderInline 与 render 都一致', () => {
    const md = createMarkdownIt({ breaks: true })
    const legacy = legacyMarkdownIt({ linkify: true, html: false, breaks: true })
    expect(md.renderInline(INLINE_SAMPLE)).toBe(legacy.renderInline(INLINE_SAMPLE))
    expect(sha256(md.renderInline(INLINE_SAMPLE))).toBe(BASELINE_DIGESTS.toolExecutionDetailInline)
    expect(sha256(md.render(SAMPLE))).toBe(BASELINE_DIGESTS.toolExecutionDetail)
    expect(md.renderInline(INLINE_SAMPLE)).toContain('&lt;i&gt;tag&lt;/i&gt;<br>')
  })

  it('代码预览面板：html 开、linkify，不把换行转成 <br>', () => {
    const html = createMarkdownIt({ html: true }).render(SAMPLE)
    expect(html).toBe(legacyMarkdownIt({ linkify: true, html: true }).render(SAMPLE))
    expect(sha256(html)).toBe(BASELINE_DIGESTS.codePreviewSurface)
    expect(html).not.toContain('<br>')
    expect(html).toContain('<script>alert(1)</script>')
  })

  it('默认值：linkify 开、html 与 breaks 关、不挂链接属性插件', () => {
    const html = createMarkdownIt().render('see https://example.com\nnext <b>x</b>')
    expect(html).toContain('<a href="https://example.com">https://example.com</a>')
    expect(html).not.toContain('<br>')
    expect(html).not.toContain('target=')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    // markdown-it 15 默认关闭模糊链接，工厂显式打开，www. 裸链接仍可点击
    expect(createMarkdownIt().render('visit www.example.net now')).toContain(
      '<a href="http://www.example.net">www.example.net</a>'
    )
    expect(createMarkdownIt({ linkify: false }).render('see https://example.com')).not.toContain(
      '<a '
    )
  })
})
