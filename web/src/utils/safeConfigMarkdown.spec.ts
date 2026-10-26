// @vitest-environment jsdom
// DOMPurify 在 happy-dom 下 isSupported 为 true 但实际不剥离任何标签（静默直通），
// 本套件必须跑在 jsdom 才能验证真实消毒行为；这也是 devDependencies 引入 jsdom 的唯一原因
import { describe, expect, it } from 'vitest'
import { sanitizeConfigMarkdownHtml } from './safeConfigMarkdown'

describe('sanitizeConfigMarkdownHtml', () => {
  it('保留常规 markdown 渲染产物（正例）', () => {
    const html = '<p><strong>hi</strong> <em>there</em></p><a href="https://example.com">link</a>'
    const result = sanitizeConfigMarkdownHtml(html)

    expect(result).toContain('<strong>hi</strong>')
    expect(result).toContain('<em>there</em>')
    expect(result).toContain('href="https://example.com"')
  })

  it('空入参返回空串（边界）', () => {
    expect(sanitizeConfigMarkdownHtml('')).toBe('')
    expect(sanitizeConfigMarkdownHtml(undefined as unknown as string)).toBe('')
  })

  it('剥离 script / style / iframe 等禁用标签（反例）', () => {
    const html =
      '<p>ok</p><script>alert(1)</script><style>body{}</style>' +
      '<iframe srcdoc="<script>alert(2)</script>"></iframe><object data="x"></object><embed src="x" />'
    const result = sanitizeConfigMarkdownHtml(html)

    expect(result).toContain('<p>ok</p>')
    expect(result).not.toContain('<script')
    expect(result).not.toContain('<style')
    expect(result).not.toContain('<iframe')
    expect(result).not.toContain('srcdoc')
    expect(result).not.toContain('<object')
    expect(result).not.toContain('<embed')
  })

  it('剥离表单类标签，防止配置区伪造交互（反例）', () => {
    const html =
      '<form action="https://evil.example.com"><input name="pwd" /><button>提交</button></form>'
    const result = sanitizeConfigMarkdownHtml(html)

    expect(result).not.toContain('<form')
    expect(result).not.toContain('<input')
    expect(result).not.toContain('<button')
  })

  it('剥离事件处理器与 javascript: 协议（反例）', () => {
    const html = '<img src="x" onerror="alert(1)" /><a href="javascript:alert(2)">x</a>'
    const result = sanitizeConfigMarkdownHtml(html)

    expect(result).not.toContain('onerror')
    expect(result).not.toContain('javascript:')
  })
})
