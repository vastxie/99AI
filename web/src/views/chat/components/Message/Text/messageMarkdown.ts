import 'highlight.js/styles/atom-one-dark.css'
import 'highlight.js/styles/atom-one-light.css'
import { createMarkdownIt } from '@/utils/markdown/createMarkdownIt'
import { currentKatex } from '@/utils/markdown/katex'
import { markdownItMath } from '@/utils/markdown/markdownItMath'
import { MARKDOWN_SENTINEL } from './markdownSentinels'

/**
 * 助手正文共用的 Markdown 实例（以前每条消息各建一个 markdown-it 加 KaTeX）。
 *
 * 渲染统一走 MarkdownVNodeRenderer（parse → VNode），只读实例、不改配置，可以共用：
 * 代码块由 CodeBlock 组件高亮 / 复制 / 预览，图片由 VNode img 自带点击预览，
 * 所以这里不配置字符串渲染用的 highlight 与图片规则。
 * 公式只有消息正文需要：在这里挂而不进工厂。KaTeX 第一次遇到公式时才加载（utils/markdown/katex），
 * 加载完成前公式显示为 TeX 源码。
 */
export const messageMarkdown = createMarkdownIt({
  linkAttributes: { target: '_blank', rel: 'noopener' },
}).use(markdownItMath, {
  katex: currentKatex,
  blockClass: 'katexmath-block p-0 flex h-full items-center justify-start',
  katexOptions: { errorColor: 'var(--semantic-danger)' },
  // 流式待定区（未闭合公式之后的原文）里有转义出来的 \]：稳定区的显示公式开符不能越过开哨兵配到它
  displayScanBarrier: MARKDOWN_SENTINEL.pendingMathOpen,
})
