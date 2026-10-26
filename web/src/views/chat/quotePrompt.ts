import { t } from '@/locales'

export interface QuotedPrompt {
  quote: string
  source?: string
  question: string
}

/**
 * 引用随提问发出去的写法：引用（及来源）在前、用户的问题在后，模型据此区分两部分。
 * 用户气泡按同样的写法拆开显示；用别的界面语言发出的无法识别，按原文显示。
 */
export function buildQuotedPrompt(quote: { text: string; sourceTitle?: string }, question: string) {
  const header = quote.sourceTitle
    ? t('previewer.quotedContentWithSource', { source: quote.sourceTitle })
    : t('previewer.quotedContent')
  return `${header}\n${quote.text}\n\n${t('previewer.userQuestion')}\n${question}`
}

export function parseQuotedPrompt(content: string): QuotedPrompt | null {
  const headerEnd = content.indexOf('\n')
  if (headerEnd < 0) return null
  const header = content.slice(0, headerEnd)
  const [sourcePrefix, sourceSuffix] = t('previewer.quotedContentWithSource', {
    source: '\u0000',
  }).split('\u0000')

  let source: string | undefined
  if (header !== t('previewer.quotedContent')) {
    const isSourceHeader =
      header.length > sourcePrefix.length + sourceSuffix.length &&
      header.startsWith(sourcePrefix) &&
      header.endsWith(sourceSuffix)
    if (!isSourceHeader) return null
    source = header.slice(sourcePrefix.length, header.length - sourceSuffix.length)
  }

  // 取最后一个分隔行：被引用的文字里恰好也有这一行时不拆错（用户的问题写在最后）
  const separator = `\n\n${t('previewer.userQuestion')}\n`
  const questionStart = content.lastIndexOf(separator)
  if (questionStart < 0) return null
  return {
    quote: content.slice(headerEnd + 1, questionStart),
    source,
    question: content.slice(questionStart + separator.length),
  }
}
