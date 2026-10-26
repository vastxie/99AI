import { describe, expect, it } from 'vitest'
import {
  cleanSourceTitle,
  cleanText,
  dedupeSourceCards,
  extractHostFromTitle,
  extractSearchQueryFromText,
  extractSourceUrlsFromText,
  extractTitleFromSourceText,
  formatDuration,
  getFaviconUrl,
  getSourceCardLinkAttrs,
  getSourceDisplayUrl,
  isDuplicateMediaSummary,
  isDuplicateText,
  isDuplicateTitlePart,
  isInternalSearchSummary,
  normalizePreviewDocumentItem,
  normalizeSourceCard,
  safeHttpUrl,
} from './ToolExecutionDetail.helpers'

describe('ToolExecutionDetail.helpers 链接处理', () => {
  it('safeHttpUrl 只放行 http(s)，裸域名补 https，去掉包裹的标点，省略号地址退回站点根', () => {
    expect(safeHttpUrl('example.com')).toBe('https://example.com/')
    expect(safeHttpUrl('（https://a.com/x），')).toBe('https://a.com/x')
    expect(safeHttpUrl('https://a.com/very/long…')).toBe('https://a.com/')
    expect(safeHttpUrl('javascript:alert(1)')).toBe('')
    expect(safeHttpUrl('ftp://a.com')).toBe('')
    expect(safeHttpUrl(undefined)).toBe('')
  })

  it('extractSourceUrlsFromText 收集 Markdown 链接、裸链接、带标签的域名与标题里的站点，去重保序', () => {
    const text = '见 [文档](https://docs.a.com/guide) 与 https://b.com/p，以及 链接：c.org/x'
    expect(extractSourceUrlsFromText(text, 'd.net')).toEqual([
      'https://docs.a.com/guide',
      'https://b.com/p',
      'https://c.org/x',
      'https://d.net/',
    ])
    // 正文为空时不看标题站点
    expect(extractSourceUrlsFromText('', 'd.net')).toEqual([])
  })

  it('extractHostFromTitle 取标题「·」后的站点', () => {
    expect(extractHostFromTitle('网页阅读 · example.com')).toBe('example.com')
    expect(extractHostFromTitle('网页阅读')).toBe('')
    expect(extractHostFromTitle(undefined)).toBe('')
  })

  it('展示地址、图标地址与链接属性', () => {
    expect(getSourceDisplayUrl('https://www.a.com/')).toBe('a.com')
    expect(getSourceDisplayUrl('https://a.com/docs')).toBe('a.com/docs')
    expect(getSourceDisplayUrl('https://a.com/x/y/z')).toBe('a.com/x/.../z')
    expect(getSourceDisplayUrl('not a url')).toBe('not a url')
    expect(getFaviconUrl('https://a.com/x')).toBe('https://a.com/favicon.ico')
    expect(getFaviconUrl('mailto:x@y.com')).toBe('')
    expect(getSourceCardLinkAttrs({ url: '' } as never)).toEqual({})
    expect(getSourceCardLinkAttrs({ url: 'https://a.com/' } as never)).toEqual({
      href: 'https://a.com/',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })
})

describe('ToolExecutionDetail.helpers 文本清理', () => {
  it('cleanText 去标签、合并空白并截断', () => {
    expect(cleanText('<b>a</b>   b')).toBe('a b')
    expect(cleanText(null)).toBe('')
    expect(cleanText('x'.repeat(200), 180)).toBe(`${'x'.repeat(180)}...`)
  })

  it('cleanSourceTitle 去掉标题符号、搜索标签与尾部地址', () => {
    expect(cleanSourceTitle('## 搜索：Vue 3 教程 URL: https://x')).toBe('Vue 3 教程')
    expect(cleanSourceTitle('关键词= 向量数据库')).toBe('向量数据库')
  })

  it('从正文里提取搜索词与标题', () => {
    expect(extractSearchQueryFromText('搜索查询：Vue 教程 摘要：xxx\n下一行')).toBe('Vue 教程')
    expect(extractSearchQueryFromText('没有查询')).toBe('')
    expect(extractTitleFromSourceText('标题：Hello World\n正文')).toBe('Hello World')
    expect(extractTitleFromSourceText('# 大标题\n内容')).toBe('大标题')
    expect(extractTitleFromSourceText('无标题')).toBe('')
    expect(isInternalSearchSummary('调用 OpenAI Responses 内置 web_search')).toBe(true)
    expect(isInternalSearchSummary('搜索 Vue')).toBe(false)
  })

  it('重复判断忽略省略号、空白、大小写与 www', () => {
    expect(isDuplicateText('结果...', '结果')).toBe(true)
    expect(isDuplicateText('', '结果')).toBe(false)
    expect(isDuplicateTitlePart('www.Example.com', 'example.com/docs')).toBe(true)
    expect(isDuplicateMediaSummary('report.PDF', 'report.pdf')).toBe(true)
    expect(isDuplicateMediaSummary('Report', 'report.pdf')).toBe(true)
    expect(isDuplicateMediaSummary('月度报告', 'report.pdf')).toBe(false)
  })

  it('formatDuration 分毫秒、秒、分秒三档，超过一天或非法值不显示', () => {
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(45_400)).toBe('45s')
    expect(formatDuration(61_000)).toBe('1m 1s')
    expect(formatDuration(25 * 60 * 60 * 1000)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('ToolExecutionDetail.helpers 文件与来源卡片', () => {
  it('normalizeSourceCard 规整来源字段；dedupeSourceCards 按地址去重', () => {
    const card = normalizeSourceCard(
      {
        title: '<b>标题</b>',
        url: 'www.a.com/p',
        snippet: '**粗体** [链接](https://x)',
        sourceName: 'Bing',
      },
      0
    )
    expect(card).toEqual({
      key: 'https://www.a.com/p',
      title: '标题',
      url: 'https://www.a.com/p',
      displayUrl: 'a.com/p',
      chipLabel: 'a.com',
      faviconUrl: 'https://www.a.com/favicon.ico',
      sourceLabel: 'Bing',
      snippet: '粗体 链接',
    })
    expect(normalizeSourceCard(null, 0)).toBeNull()
    const titleOnly = normalizeSourceCard({ title: 'x' }, 3)
    expect(titleOnly).toMatchObject({ key: 'x--3', url: '', chipLabel: 'x', faviconUrl: '' })

    expect(dedupeSourceCards([card!, { ...card!, title: '另一个标题' }, titleOnly!])).toEqual([
      card,
      titleOnly,
    ])
  })

  it('文件预览项：正文为空时不算预览', () => {
    expect(
      normalizePreviewDocumentItem({
        name: 'a.md',
        previewContent: '# x',
        previewContentType: 'markdown',
      })
    ).toEqual({
      title: 'a.md',
      fileType: undefined,
      previewContent: '# x',
      previewContentType: 'markdown',
      downloadUrl: undefined,
    })
    expect(normalizePreviewDocumentItem({ previewContent: '   ' })).toBeNull()
  })
})
