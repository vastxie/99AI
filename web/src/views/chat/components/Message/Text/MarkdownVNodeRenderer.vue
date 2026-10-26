<script lang="ts">
import type { MarkdownIt } from 'markdown-it'
import { isHttpProtocol, isHttpUrl } from '@/utils/is'
import { katexState } from '@/utils/markdown/katex'
import {
  Fragment,
  defineComponent,
  h,
  isMemoSame,
  isVNode,
  markRaw,
  type PropType,
  type VNode,
  type VNodeChild,
} from 'vue'
import type { CodeContentType } from '@/types/preview-panel'
import CodeBlock from './CodeBlock.vue'
import { MARKDOWN_SENTINEL, toSafeHttpUrl } from './markdownSource.helpers'
import {
  UNSTABLE_TAIL_BLOCKS,
  parseMarkdownFully,
  parseMarkdownIncrementally,
  type IncrementalParseCache,
} from './incrementalMarkdown'

type MarkdownToken = {
  type: string
  tag: string
  attrs: [string, string][] | null
  map: [number, number] | null
  nesting: number
  level: number
  children: MarkdownToken[] | null
  content: string
  markup: string
  info: string
  meta: any
  block: boolean
  hidden: boolean
  attrGet: (name: string) => string | null
}

// 流式增量解析缓存按组件实例保存在响应式系统之外，避免 token 数组被深度代理
const incrementalCaches = new WeakMap<object, IncrementalParseCache<MarkdownToken>>()

interface TopLevelBlockRange {
  startIndex: number
  endIndex: number
}

/**
 * 顶层块的 VNode 缓存（按组件实例，响应式系统之外）。
 * 流式期间除末尾 UNSTABLE_TAIL_BLOCKS 个块外，其余块的 token 对象在增量解析里原样复用；
 * 这里以「块首尾 token 身份 + 渲染参数」为依赖缓存整块 VNode，命中时回传同一个对象，
 * Vue 的 patch 对同一 VNode 直接短路，已冻结的正文一帧都不再 diff。
 */
interface BlockRenderRecord {
  ranges: TopLevelBlockRange[]
  memo: Array<VNode | undefined>
  /** 上一次解析是否是完整解析（流结束时用于跳过重复的第二遍全量解析） */
  lastParseFull: boolean
}
const blockRenderRecords = new WeakMap<object, BlockRenderRecord>()

type MemoizedVNode = VNode & { memo?: unknown[] }

/**
 * 把扁平 token 流按顶层块切段（level 0 的开闭配对，或 level 0 的单个块 token）。
 * 结构异常（找不到闭合）时把剩余 token 并成最后一块，保证任何输入都有稠密的分段。
 */
function splitTopLevelRanges(tokens: MarkdownToken[]): TopLevelBlockRange[] {
  const ranges: TopLevelBlockRange[] = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    if (token.level !== 0 || token.nesting === -1) {
      ranges.push({ startIndex: index, endIndex: tokens.length - 1 })
      break
    }
    if (token.nesting === 0) {
      ranges.push({ startIndex: index, endIndex: index })
      index += 1
      continue
    }
    let closeIndex = -1
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const candidate = tokens[cursor]
      if (candidate.level === 0 && candidate.nesting === -1) {
        closeIndex = cursor
        break
      }
    }
    if (closeIndex < 0) {
      ranges.push({ startIndex: index, endIndex: tokens.length - 1 })
      break
    }
    ranges.push({ startIndex: index, endIndex: closeIndex })
    index = closeIndex + 1
  }
  return ranges
}

function countCodeBlockTokens(tokens: MarkdownToken[], startIndex: number, endIndex: number) {
  let count = 0
  for (let index = startIndex; index <= endIndex; index += 1) {
    const type = tokens[index].type
    if (type === 'fence' || type === 'code_block') count += 1
  }
  return count
}

const PRIVATE_FILE_DOWNLOAD_URL_SOURCE = String.raw`(?:https?:\/\/[^/\s)\]'"<>]+)?\/api\/files\/file_[a-zA-Z0-9_-]+\/download(?:[?#][^\s)\]'"<>]*)?`

function isPrivateFileDownloadUrl(value: string) {
  return new RegExp(`^${PRIVATE_FILE_DOWNLOAD_URL_SOURCE}$`, 'i').test(value.trim())
}

function isUnsafeImageUrl(value: string) {
  return /^\s*(?:javascript|data):/i.test(value) || isPrivateFileDownloadUrl(value)
}

function tokenAttrsToProps(token: MarkdownToken) {
  const attrs: Record<string, string> = {}

  token.attrs?.forEach(([name, value]) => {
    attrs[name] = value
  })

  return attrs
}

function extractTokenText(tokens: MarkdownToken[]): string {
  return tokens
    .map(token => {
      if (token.type === 'text' || token.type === 'code_inline') return token.content || ''
      if (token.type === 'inline') return extractTokenText(token.children || [])
      return ''
    })
    .join('')
}

function normalizeUrlText(value: string) {
  return value.trim().replaceAll(/^<|>$/gu, '').replace(/\/$/u, '')
}

function shouldShortenLinkText(href: string, text: string) {
  if (!isHttpUrl(href)) return false

  return normalizeUrlText(href) === normalizeUrlText(text)
}

function formatLinkLabel(href: string) {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./iu, '')
    const pathParts = url.pathname.split('/').filter(Boolean)

    if (pathParts.length === 0) return host
    if (pathParts.length === 1) return `${host}/${pathParts[0]}`

    const first = pathParts[0]
    const last = pathParts.at(-1)!
    return `${host}/${first}/.../${last}`
  } catch {
    return href
  }
}

function getLinkFaviconUrl(href: string) {
  try {
    const url = new URL(href)
    if (!isHttpProtocol(url.protocol)) return ''

    return `${url.origin}/favicon.ico`
  } catch {
    return ''
  }
}

function renderGlobeIcon() {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      style: {
        width: '1em',
        height: '1em',
        display: 'block',
        flex: '0 0 auto',
      },
    },
    [
      h('circle', { cx: '12', cy: '12', r: '10' }),
      h('path', { d: 'M2 12h20' }),
      h('path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10' }),
      h('path', { d: 'M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10' }),
    ]
  )
}

function renderLinkIcon(href: string) {
  const faviconUrl = getLinkFaviconUrl(href)
  const children: VNodeChild[] = [renderGlobeIcon()]

  if (faviconUrl) {
    children.push(
      h('img', {
        src: faviconUrl,
        alt: '',
        class: 'chat-markdown-link-favicon',
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'no-referrer',
        style: {
          width: '1em',
          height: '1em',
          maxWidth: '1em',
          maxHeight: '1em',
          display: 'block',
          objectFit: 'contain',
        },
        onError: (event: Event) => {
          const image = event.currentTarget as HTMLImageElement | null
          if (image) image.classList.add('chat-markdown-link-favicon-error')
        },
      })
    )
  }

  return children
}

function renderPluginHtml(
  markdown: MarkdownIt,
  token: MarkdownToken,
  inline = false,
  key?: string
): VNodeChild {
  const rendered = markdown.renderer.render([token as any], markdown.options, {})
  const tag = inline ? 'span' : 'div'

  return h(tag, { key, innerHTML: rendered })
}

function findCloseToken(tokens: MarkdownToken[], openIndex: number) {
  const openToken = tokens[openIndex]
  const closeType = openToken.type.replace(/_open$/u, '_close')
  let depth = 0

  for (let idx = openIndex + 1; idx < tokens.length; idx += 1) {
    const token = tokens[idx]

    if (token.type === openToken.type) {
      depth += 1
      continue
    }

    if (token.type === closeType) {
      if (depth === 0) return idx
      depth -= 1
    }
  }

  return openIndex
}

function getFenceLanguage(token: MarkdownToken) {
  return token.info?.trim().split(/\s+/u)[0] || 'text'
}

const SENTINEL_TOKEN_SPEC: Record<string, { type: string; tag: string; nesting: 1 | -1 }> = {
  [MARKDOWN_SENTINEL.strongOpen]: { type: 'sentinel_strong_open', tag: 'strong', nesting: 1 },
  [MARKDOWN_SENTINEL.strongClose]: { type: 'sentinel_strong_close', tag: 'strong', nesting: -1 },
  [MARKDOWN_SENTINEL.pendingMathOpen]: {
    type: 'sentinel_pending_math_open',
    tag: 'span',
    nesting: 1,
  },
  [MARKDOWN_SENTINEL.pendingMathClose]: {
    type: 'sentinel_pending_math_close',
    tag: 'span',
    nesting: -1,
  },
}

const SENTINEL_SPLIT_PATTERN = new RegExp(
  `([${MARKDOWN_SENTINEL.strongOpen}${MARKDOWN_SENTINEL.strongClose}${MARKDOWN_SENTINEL.pendingMathOpen}${MARKDOWN_SENTINEL.pendingMathClose}])`,
  'u'
)

const SENTINEL_STRIP_PATTERN = new RegExp(`[${MARKDOWN_SENTINEL.reference}]`, 'gu')

// 覆盖全部哨兵码位，用于代码 token 的兜底剥离
const SENTINEL_ANY_PATTERN = /[\uE000-\uE004]/gu

function createSyntheticToken(
  type: string,
  tag: string,
  nesting: 1 | -1 | 0,
  attrs: [string, string][] | null = null,
  content = ''
): MarkdownToken {
  return {
    type,
    tag,
    attrs,
    map: null,
    nesting,
    level: 0,
    children: null,
    content,
    markup: '',
    info: '',
    meta: null,
    block: false,
    hidden: false,
    attrGet: (name: string) => attrs?.find(([attrName]) => attrName === name)?.[1] ?? null,
  }
}

// 把文本中的哨兵字符还原成成对的合成 token，交给既有的 open/close 渲染逻辑处理。
// inline children 是扁平数组，因此 findCloseToken 能正确配对。
function expandSentinelTokens(tokens: MarkdownToken[]): MarkdownToken[] {
  const expanded: MarkdownToken[] = []

  tokens.forEach(token => {
    if (token.children?.length) {
      token.children = expandSentinelTokens(token.children)
    }

    // 防御性兜底：代码 token 不参与哨兵还原，一旦有哨兵漏进来就会变成代码里的
    // 不可见私有区字符，并被复制/预览带走，因此这里无条件剥除
    if (token.type === 'fence' || token.type === 'code_block' || token.type === 'code_inline') {
      // 直接 replace，不用带 g 标志的正则做 test（lastIndex 会带状态，隔次漏匹配）
      if (token.content) token.content = token.content.replace(SENTINEL_ANY_PATTERN, '')
      expanded.push(token)
      return
    }

    if (token.type !== 'text' || !token.content) {
      expanded.push(token)
      return
    }

    // 引用哨兵不在此剥离：link_open 分支要靠它识别角标，残留的会在渲染文本时清掉
    if (!SENTINEL_SPLIT_PATTERN.test(token.content)) {
      expanded.push(token)
      return
    }

    token.content.split(SENTINEL_SPLIT_PATTERN).forEach(part => {
      if (!part) return

      const spec = SENTINEL_TOKEN_SPEC[part]
      if (spec) {
        const attrs: [string, string][] | null =
          spec.type === 'sentinel_pending_math_open' ? [['class', 'streaming-pending-math']] : null
        expanded.push(createSyntheticToken(spec.type, spec.tag, spec.nesting, attrs))
        return
      }

      expanded.push(createSyntheticToken('text', '', 0, null, part))
    })
  })

  return expanded
}

export default defineComponent({
  name: 'MarkdownVNodeRenderer',
  props: {
    source: {
      type: String,
      default: '',
    },
    markdown: {
      type: Object as PropType<MarkdownIt>,
      required: true,
    },
    streaming: {
      type: Boolean,
      default: false,
    },
    stateScope: {
      type: String,
      default: '',
    },
    allowWorkspace: {
      type: Boolean,
      default: true,
    },
  },
  emits: {
    previewCode: (_payload: {
      content: string
      contentType: CodeContentType
      title?: string
      sourceKey?: string
    }) => true,
    previewImage: (_src: string) => true,
  },
  data() {
    return {
      parsedTokens: [] as MarkdownToken[],
      parsedSource: '',
    }
  },
  watch: {
    source: {
      handler() {
        this.scheduleParse()
      },
      immediate: true,
    },
    markdown() {
      this.parseNow(true)
    },
    streaming(value: boolean) {
      // 流结束时 source 往往同时收口：source 的 watcher 已经按完成态做过完整解析，
      // 这里只清缓存、不再做第二遍全量解析
      const record = this.getBlockRenderRecord()
      if (!value && record.lastParseFull && this.source === this.parsedSource) {
        record.memo = []
        return
      }
      this.parseNow(true)
    },
  },
  beforeUnmount() {
    incrementalCaches.delete(this)
    blockRenderRecords.delete(this)
  },
  methods: {
    parseNow(force = false) {
      if (!force && this.source === this.parsedSource) return

      this.parsedSource = this.source
      // 流式期间只重新解析尾部几个块；强制解析（流结束 / 换渲染器）走完整解析以自愈引用等偏差
      const incremental = this.streaming && !force
      const parsed = incremental
        ? parseMarkdownIncrementally<MarkdownToken>(
            this.markdown,
            this.source,
            incrementalCaches.get(this)
          )
        : parseMarkdownFully<MarkdownToken>(this.markdown, this.source)
      if (this.streaming) {
        incrementalCaches.set(this, parsed.cache)
      } else {
        incrementalCaches.delete(this)
      }
      // 复用的前缀 token 在上一轮已经做过哨兵展开（展开就地改写 children、保留块 token 身份），
      // 只对新解析出的尾部再展开一次
      const frozenCount = Math.min(parsed.frozenTokenCount, parsed.tokens.length)
      const tokens =
        frozenCount > 0
          ? parsed.tokens
              .slice(0, frozenCount)
              .concat(expandSentinelTokens(parsed.tokens.slice(frozenCount)))
          : expandSentinelTokens(parsed.tokens)
      const record = this.getBlockRenderRecord()
      record.lastParseFull = !incremental
      record.ranges = splitTopLevelRanges(tokens)
      // 完整解析（流结束 / 换渲染器）后缓存的 VNode 全部失效
      if (!this.streaming || force) record.memo = []
      this.parsedTokens = markRaw(tokens)
    },
    getBlockRenderRecord(): BlockRenderRecord {
      let record = blockRenderRecords.get(this)
      if (!record) {
        record = { ranges: [], memo: [], lastParseFull: false }
        blockRenderRecords.set(this, record)
      }
      return record
    },
    scheduleParse() {
      // 流式期间也同步解析：增量解析已经很便宜，而延到 requestAnimationFrame 会让内容
      // 在跟随滚动之后才长高，贴底的状态行先被顶出一行、下一帧再吸回来，表现为抖动
      this.parseNow()
    },
    renderTextToken(rawContent: string, key: string): VNodeChild {
      // 兜底清除未被消费的引用哨兵，避免私有区字符出现在正文里
      const content = rawContent.includes(MARKDOWN_SENTINEL.reference)
        ? rawContent.replace(SENTINEL_STRIP_PATTERN, '')
        : rawContent

      // 流式与完成态都直接输出文本节点：逐字淡入会在每次增量时重建 span 并重启动画，是可见闪烁来源之一
      return content
    },
    renderTokenList(
      tokens: MarkdownToken[],
      path = 't',
      context?: { codeBlockIndex: number }
    ): VNodeChild[] {
      const renderContext = context ?? { codeBlockIndex: 0 }
      const nodes: VNodeChild[] = []
      let idx = 0

      while (idx < tokens.length) {
        const token = tokens[idx]
        const tokenKey = `${path}-${idx}`

        if (token.hidden || token.nesting === -1) {
          idx += 1
          continue
        }

        if (token.nesting === 1) {
          const closeIndex = findCloseToken(tokens, idx)
          const childTokens = tokens.slice(idx + 1, closeIndex)
          const children = this.renderTokenList(childTokens, tokenKey, renderContext)
          nodes.push(this.renderOpenToken(token, children, tokenKey, childTokens))
          idx = closeIndex + 1
          continue
        }

        nodes.push(this.renderSingleToken(token, tokenKey, renderContext))
        idx += 1
      }

      return nodes
    },
    renderOpenToken(
      token: MarkdownToken,
      children: VNodeChild[],
      key: string,
      childTokens: MarkdownToken[] = []
    ): VNodeChild {
      const attrs = tokenAttrsToProps(token)
      attrs.key = key

      if (token.type === 'link_open') {
        const rawLinkText = extractTokenText(childTokens)

        // 引用角标：`[[1](url)]` 在 source 层被改写成带哨兵前缀的普通链接
        if (rawLinkText.startsWith(MARKDOWN_SENTINEL.reference)) {
          const referenceUrl = toSafeHttpUrl(attrs.href || '')
          if (!referenceUrl) return ''

          const referenceLabel = rawLinkText.slice(MARKDOWN_SENTINEL.reference.length)

          return h(
            'button',
            {
              key,
              type: 'button',
              class:
                'chat-reference-link inline-flex mr-1 h-4 w-4 items-center justify-center rounded-full text-sm text-text-inverse transition-colors',
              style: { background: 'var(--agent-running)' },
              title: referenceUrl,
              onClick: (event: Event) => {
                event.stopPropagation()
                event.preventDefault()
                window.open(referenceUrl, '_blank', 'noopener')
              },
            },
            referenceLabel
          )
        }

        attrs.target = attrs.target || '_blank'
        attrs.rel = attrs.rel || 'noopener noreferrer'
        attrs.class = [attrs.class, 'chat-markdown-link'].filter(Boolean).join(' ')

        const href = attrs.href || ''
        const rawText = rawLinkText
        const shouldShorten = shouldShortenLinkText(href, rawText)
        const label = shouldShorten ? formatLinkLabel(href) : null
        attrs.title = attrs.title || href

        return h(token.tag || 'a', attrs, [
          h('span', { class: 'chat-markdown-link-icon' }, renderLinkIcon(href)),
          h('span', { class: 'chat-markdown-link-label' }, label || children),
        ])
      }

      return h(token.tag || 'span', attrs, children)
    },
    renderSingleToken(
      token: MarkdownToken,
      key: string,
      context: { codeBlockIndex: number }
    ): VNodeChild {
      switch (token.type) {
        case 'inline':
          return h(Fragment, { key }, this.renderTokenList(token.children || [], key, context))
        case 'text':
          return this.renderTextToken(token.content, key)
        case 'softbreak':
          return '\n'
        case 'hardbreak':
          return h('br', { key })
        case 'code_inline':
          return h('code', { key }, token.content)
        case 'fence':
        case 'code_block': {
          const codeBlockIndex = context.codeBlockIndex
          context.codeBlockIndex += 1

          return h(CodeBlock, {
            // 用代码块序号做 key：流式中前文 token 增减不会导致组件重建（避免闪烁）
            key: `cb-${codeBlockIndex}`,
            code: token.content,
            language: getFenceLanguage(token),
            streaming: this.streaming,
            allowWorkspace: this.allowWorkspace,
            stateKey: this.stateScope
              ? `${this.stateScope}:code-block-${codeBlockIndex}`
              : undefined,
            onOpenWorkspace: (payload: {
              content: string
              contentType: CodeContentType
              title?: string
              sourceKey?: string
            }) => this.$emit('previewCode', payload),
          })
        }
        case 'image': {
          const src = token.attrGet('src') || ''
          if (!src || isUnsafeImageUrl(src)) return ''

          const title = token.attrGet('title') || token.content || ''
          return h('img', {
            key,
            src,
            alt: token.content || '',
            title,
            // 不懒加载：宽高自适应的图片加载前是 0×0，Chrome 在对话画布里一直不判定它进入视口，图片不会去请求；
            // 解码仍不占主线程
            decoding: 'async',
            class: 'chat-markdown-image',
            onClick: (event: Event) => {
              event.stopPropagation()
              event.preventDefault()
              this.$emit('previewImage', src)
            },
          })
        }
        case 'math_inline':
        case 'math_display':
          // 显示公式是行内规则产生的：KaTeX 输出 span.katex-display（块级排版），可以留在段落里
          return renderPluginHtml(this.markdown, token, true, key)
        case 'math_block':
          return renderPluginHtml(this.markdown, token, false, key)
        case 'hr':
          return h('hr', { key })
        default:
          return token.content || ''
      }
    },
  },
  render() {
    const tokens = this.parsedTokens
    const record = this.getBlockRenderRecord()
    const ranges = record.ranges
    const context = { codeBlockIndex: 0 }
    // KaTeX 按需加载：加载完成时公式从 TeX 源码换成排版结果，冻结块的缓存以它为依赖之一
    const mathState = katexState()
    // 流式与完成态共用同一套按块的 key（块首 token 下标），完成后的完整解析得到相同的 token
    // 序列，因此不会因为换 key 而重挂载正文
    const memoizableCount = this.streaming ? Math.max(0, ranges.length - UNSTABLE_TAIL_BLOCKS) : 0
    const nodes: VNodeChild[] = []

    ranges.forEach((range, blockIndex) => {
      const blockKey = `b-${range.startIndex}`
      if (blockIndex < memoizableCount) {
        const deps = [
          tokens[range.startIndex],
          tokens[range.endIndex],
          this.markdown,
          this.allowWorkspace,
          this.stateScope,
          mathState,
        ]
        const cached = record.memo[blockIndex]
        if (cached && isMemoSame(cached, deps)) {
          nodes.push(cached)
          context.codeBlockIndex += countCodeBlockTokens(tokens, range.startIndex, range.endIndex)
          return
        }
        const rendered = this.renderTokenList(
          tokens.slice(range.startIndex, range.endIndex + 1),
          blockKey,
          context
        )
        if (rendered.length === 1 && isVNode(rendered[0])) {
          const vnode = rendered[0] as MemoizedVNode
          vnode.memo = deps
          record.memo[blockIndex] = vnode
        } else {
          record.memo[blockIndex] = undefined
        }
        nodes.push(...rendered)
        return
      }
      record.memo[blockIndex] = undefined
      nodes.push(
        ...this.renderTokenList(
          tokens.slice(range.startIndex, range.endIndex + 1),
          blockKey,
          context
        )
      )
    })

    return h(Fragment, {}, nodes)
  },
})
</script>

<style scoped>
.streaming-pending-math {
  white-space: pre-wrap;
}
</style>
