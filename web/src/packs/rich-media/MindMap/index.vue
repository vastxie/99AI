<script lang="ts">
// markmap 自带的公式插件产出 KaTeX 结构，排版依赖 KaTeX 的样式（公式按需加载后不再是全局样式）
import 'katex/dist/katex.min.css'
import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify'
import type { IPureNode } from 'markmap-common'

// ─────────────────────────────────────────────────────────────────────────────
// markmap 节点内容净化：本文件是唯一实现
//
// 为什么需要净化：markmap-lib 的 transform 会原样保留 Markdown 中的内联 HTML，而
// markmap-view 是用 innerHTML 把节点 content 注入 SVG foreignObject 的，模型可控
// 内容会直接形成 XSS，因此必须在 setData 之前逐节点净化。
//
// 为什么实现放在这个组件文件里：净化逻辑被消息卡片（本文件）和右侧预览面板
// （Previewer/Renderers/MarkMapRenderer.vue）共用，两边各留一份复制曾导致「只改一处
// 白名单、两端表现不一致」。这里通过普通 <script> 块导出，MarkMapRenderer.vue 直接
// import 复用；宿主选本文件是因为 MarkMapRenderer.vue 额外依赖 html-to-image /
// FreeMindGenerator，反向 import 会把这些只服务导出的重依赖带进消息列表分包。
//
// 白名单必须同时满足两个目标：
// 1) 思维导图的正常表达能力：链接、图片、表格（含表头）、列表、代码块、行内格式；
// 2) markmap-lib 默认启用的 katex 插件产物 —— KaTeX 的可视分支 .katex-html 完全依赖
//    class 与少量内联 style（vlist 定位 top/height、分数线 border-bottom-width、
//    mspace 的 margin），MathML 分支被 katex.min.css 的 .katex-mathml 裁剪隐藏、只用于
//    可访问性与公式源码；任一被剥掉公式都会渲染成错误内容（如 \frac{a}{b} 变成 "ba"）。
//    markmap 的任务列表复选框与 KaTeX 根号同样是内联 <svg><path>。
// ─────────────────────────────────────────────────────────────────────────────

const MARKMAP_ALLOWED_TAGS = [
  // 行内排版
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'del',
  'ins',
  'code',
  'kbd',
  'mark',
  'small',
  'sub',
  'sup',
  'span',
  'p',
  'br',
  'hr',
  'blockquote',
  // 链接与图片（协议在 afterSanitizeAttributes 钩子里二次收紧）
  'a',
  'img',
  // 列表
  'ul',
  'ol',
  'li',
  // 表格：thead / th 属于 DOMPurify 的 FORBID_CONTENTS，不放行会把表头整段删掉
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  // 代码块：pre 被剥掉后多行代码会塌成一行
  'pre',
  // 内联 SVG：KaTeX 根号 / 大括号、markmap 任务列表复选框（不含 animate/use/foreignObject）
  'svg',
  'path',
  'line',
  'g',
  // KaTeX MathML 分支
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'ms',
  'mtext',
  'mspace',
  'mfrac',
  'msqrt',
  'mroot',
  'msub',
  'msup',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
]

const MARKMAP_ALLOWED_ATTR = [
  // 通用
  'class',
  'style',
  'title',
  'aria-hidden',
  // 链接与图片
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'width',
  'height',
  // 表格与列表
  'colspan',
  'rowspan',
  'scope',
  'align',
  'start',
  // 内联 SVG
  'xmlns',
  'viewBox',
  'preserveAspectRatio',
  'd',
  'fill',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  // MathML
  'display',
  'mathvariant',
  'stretchy',
  'fence',
  'separator',
  'lspace',
  'rspace',
  'minsize',
  'maxsize',
  'displaystyle',
  'scriptlevel',
  'notation',
  'depth',
  'voffset',
  'encoding',
  'accent',
  'accentunder',
  'linethickness',
]

// 白名单之外的兜底：即使将来有人放宽 ALLOWED_TAGS，这些标签也必须继续被清除
const MARKMAP_FORBID_TAGS = [
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
  'label',
  'fieldset',
  'link',
  'meta',
  'base',
  'template',
  'noscript',
  'title',
  'desc',
  'foreignobject',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
  'use',
  'image',
  'audio',
  'video',
  'source',
  'track',
  'marquee',
  'plaintext',
  'xmp',
  'frame',
  'frameset',
  'annotation-xml',
  'mglyph',
  'maction',
]

// 事件属性（on*）不在 ALLOWED_ATTR 里就已经被 DOMPurify 丢弃，这里补的是其余高危属性
const MARKMAP_FORBID_ATTR = [
  'srcdoc',
  'formaction',
  'action',
  'xlink:href',
  'xlink:show',
  'xlink:actuate',
  'ping',
  'srcset',
  'background',
  'dynsrc',
  'lowsrc',
  'autofocus',
  'id',
  'name',
  'is',
]

// style 只保留排版必需的属性：KaTeX 的 vlist 定位、markdown 表格对齐、\color。
// 刻意不放行 position / z-index / transform / opacity / display 等可做覆盖层的属性。
const MARKMAP_ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'top',
  'vertical-align',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-color',
  'border-bottom-color',
  'border-style',
  'text-align',
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'line-height',
  'white-space',
  'text-decoration',
])

// 外部请求 / 旧版表达式 / 注释绕过 / 协议注入
const UNSAFE_STYLE_VALUE_RE =
  /url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:|@import|[<>\\]|\/\*|\*\//i
const SAFE_STYLE_VALUE_RE = /^[a-zA-Z0-9\s%#.,()+\-_/'"!]*$/

const LINK_PROTOCOL_RE = /^(?:https?|mailto):/i
const IMAGE_PROTOCOL_RE = /^https?:/i
const ANY_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
// data: 图片只放行位图，明确排除 svg+xml（可携带脚本）
const SAFE_IMAGE_DATA_RE =
  /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp)\s*;\s*base64\s*,[a-z0-9+/=\s]+$/i
// 控制字符 / 各类空白 / 零宽字符：`ja\tva\nscript:` 之类的分片绕过
const URL_NOISE_RE =
  /[\u0000-\u0020\u007f-\u00a0\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u2060\u3000\ufeff]/g

const stripUrlNoise = (value: string): string => value.replace(URL_NOISE_RE, '')

const sanitizeStyleAttribute = (raw: string): string => {
  if (!raw || raw.length > 2000) return ''

  const kept: string[] = []
  for (const declaration of raw.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator <= 0) continue

    const prop = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if (!prop || !value) continue
    if (!MARKMAP_ALLOWED_STYLE_PROPS.has(prop)) continue
    if (UNSAFE_STYLE_VALUE_RE.test(value)) continue
    if (!SAFE_STYLE_VALUE_RE.test(value)) continue

    kept.push(`${prop}:${value}`)
  }

  return kept.join(';')
}

const isSafeLinkHref = (raw: string): boolean => {
  const value = stripUrlNoise(raw)
  if (!value) return false
  if (LINK_PROTOCOL_RE.test(value)) return true
  // 无协议即相对链接 / 锚点，安全
  return !ANY_SCHEME_RE.test(value)
}

const isSafeImageSrc = (raw: string): boolean => {
  const value = stripUrlNoise(raw)
  if (!value) return false
  if (IMAGE_PROTOCOL_RE.test(value)) return true
  if (SAFE_IMAGE_DATA_RE.test(value)) return true
  return !ANY_SCHEME_RE.test(value)
}

const MARKMAP_SANITIZE_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: MARKMAP_ALLOWED_TAGS,
  ALLOWED_ATTR: MARKMAP_ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORBID_TAGS: MARKMAP_FORBID_TAGS,
  FORBID_ATTR: MARKMAP_FORBID_ATTR,
  KEEP_CONTENT: true,
}

// 用独立的 DOMPurify 实例挂钩子，避免污染全局实例（safeConfigMarkdown、
// FilePreviewPanel 等处共用默认实例）
let markmapPurifier: typeof DOMPurify | null = null

const getMarkmapPurifier = (): typeof DOMPurify => {
  if (markmapPurifier) return markmapPurifier

  const instance = DOMPurify()
  instance.addHook('afterSanitizeAttributes', node => {
    if (typeof node?.getAttribute !== 'function') return
    const tag = (node.tagName || '').toLowerCase()

    if (node.hasAttribute('style')) {
      const safeStyle = sanitizeStyleAttribute(node.getAttribute('style') || '')
      if (safeStyle) node.setAttribute('style', safeStyle)
      else node.removeAttribute('style')
    }

    if (tag === 'a') {
      const href = node.getAttribute('href')
      if (href === null || !isSafeLinkHref(href)) {
        node.removeAttribute('href')
        node.removeAttribute('target')
        node.removeAttribute('rel')
        return
      }
      // 外链一律新窗口打开，并阻断 window.opener 反向控制
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
      return
    }

    if (tag === 'img') {
      const src = node.getAttribute('src')
      if (src === null || !isSafeImageSrc(src)) {
        node.removeAttribute('src')
        node.remove()
      }
    }
  })

  markmapPurifier = instance
  return markmapPurifier
}

export const sanitizeMarkmapContent = (content: unknown): string => {
  if (typeof content !== 'string' || content === '') return ''

  const purifier = getMarkmapPurifier()
  // DOMPurify 在不受支持的环境里会退化成原样返回，那等于把模型输出直接送进
  // innerHTML；这里改成失败关闭，宁可节点空白也不放行未净化内容
  if (!purifier.isSupported) return ''

  return purifier.sanitize(content, MARKMAP_SANITIZE_CONFIG)
}

// 节点树深度上限：超出部分直接丢弃，而不是放行未净化的内容
const MARKMAP_MAX_NODE_DEPTH = 500

// 用显式栈迭代遍历而非递归，避免超深节点树把调用栈撑爆
export const sanitizeMarkmapTree = (root: IPureNode): IPureNode => {
  const stack: Array<{ node: IPureNode; depth: number }> = [{ node: root, depth: 0 }]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) break

    const { node, depth } = current
    if (!node || typeof node !== 'object') continue

    node.content = sanitizeMarkmapContent(node.content)

    const children = Array.isArray(node.children) ? node.children : []
    node.children = depth >= MARKMAP_MAX_NODE_DEPTH ? [] : children

    for (const child of node.children) {
      stack.push({ node: child, depth: depth + 1 })
    }
  }

  return root
}
</script>

<script lang="ts" setup>
import UiButton from '@/components/common/UiButton.vue'
import UiTooltip from '@/components/common/UiTooltip.vue'

import { Copy, SquarePen, Trash2 } from '@lucide/vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import '../markmap-theme.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { isMobile } = useViewport()

interface Props {
  cid?: string
  content?: string
  status?: number
  loading?: boolean
  model?: string
  modelName?: string
  index?: number
}

const transformer = new Transformer()

const props = defineProps<Props>()

const emit = defineEmits<{
  delete: []
  copy: []
}>()
const svgRef = ref()
const renderError = ref('')

const globalStore = useGlobalStoreWithOut()

// 从内容中提取第一个一级标题
const extractTitle = computed(() => {
  const lines = props.content?.split('\n') || []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim()
    }
  }
  return t('chat.mindMap')
})

let updateTimeout: ReturnType<typeof setTimeout> | null = null
let finalRenderTimeout: ReturnType<typeof setTimeout> | null = null
let mm: Markmap | undefined

onMounted(() => {
  mm = Markmap.create(svgRef.value, { paddingX: 16 })
  if (props.content) {
    renderMarkmap()
  }
})

// Markmap 在构造时登记了模块级钩子与 ResizeObserver，只有 destroy() 才会释放；
// 不销毁的话，每看过一条思维导图消息就留下一份 SVG、数据与观察器
onBeforeUnmount(() => {
  if (updateTimeout) clearTimeout(updateTimeout)
  if (finalRenderTimeout) clearTimeout(finalRenderTimeout)
  updateTimeout = null
  finalRenderTimeout = null
  mm?.destroy()
  mm = undefined
})

const renderMarkmap = () => {
  if (updateTimeout) clearTimeout(updateTimeout)

  updateTimeout = setTimeout(() => {
    if (!props.content || !mm) return

    try {
      renderError.value = ''

      const { root } = transformer.transform(props.content)

      // 净化节点内容后再渲染，避免模型输出的 HTML 直接进 innerHTML
      mm.setData(sanitizeMarkmapTree(root))

      // 确保在DOM更新和字体加载后执行fit
      nextTick(() => {
        const refit = () => {
          if (mm) mm.fit()
        }
        if (document.fonts?.ready) {
          document.fonts.ready.then(refit)
        } else {
          // Fallback
          setTimeout(refit, 0)
        }
      })
    } catch (error) {
      // 渲染失败时不要静默吞掉，否则只剩一张空白 SVG
      renderError.value = error instanceof Error ? error.message : String(error)
    }
  }, 100)
}

// 监听content变化，实现渐进式渲染
watch(
  () => props.content,
  (newContent, oldContent) => {
    // 只有内容真正发生变化时才重新渲染
    if (newContent !== oldContent && newContent) {
      // MindMap内容已更新
      renderMarkmap()
    }
  },
  { immediate: false }
)

// 同时监听loading状态，当loading结束时也触发一次渲染
watch(
  () => props.loading,
  (newLoading, oldLoading) => {
    // 当loading从true变为false时，确保最终渲染
    if (oldLoading && !newLoading && props.content) {
      // MindMap loading完成，执行最终渲染
      if (finalRenderTimeout) clearTimeout(finalRenderTimeout)
      finalRenderTimeout = setTimeout(() => {
        finalRenderTimeout = null
        renderMarkmap()
      }, 200)
    }
  }
)

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  emit('delete')
}

// 使用统一右侧预览面板显示思维导图
const showFullscreen = () => {
  if (props.content && props.content.trim() !== '') {
    globalStore.openPanel({
      type: 'code',
      content: props.content,
      contentType: 'markmap',
    })
  }
}
</script>

<template>
  <div class="flex flex-col group max-w-full w-full">
    <div class="leading-relaxed break-words w-full">
      <div class="w-full flex flex-col items-start" :class="isMobile ? '' : 'pr-10'">
        <!-- 卡片容器 -->
        <div
          class="w-full text-base text-text-primary rounded-xl p-0 border border-app-border shadow-sm flex flex-col relative font-sans leading-7 tracking-wide transition-colors duration-xl"
          style="
            width: 100%;
            background: linear-gradient(135deg, var(--app-surface), var(--app-surface-sunken));
          "
        >
          <!-- 卡片标题 -->
          <div class="px-5 pt-3 pb-3 flex-shrink-0 border-b border-app-divider relative">
            <div class="font-medium mb-0 text-text-primary text-center text-lg pb-2 relative">
              {{ extractTitle }}
              <div
                class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-[60px] h-[1px] bg-gradient-to-r from-transparent via-accent to-transparent rounded"
              ></div>
            </div>

            <!-- 编辑按钮（原全屏按钮）放到右上角 -->
            <div class="absolute top-3 right-3">
              <UiTooltip :text="t('chat.editMindMap')" placement="left">
                <UiButton
                  icon
                  type="button"
                  @click="showFullscreen"
                  class="btn-icon-action"
                  :aria-label="t('chat.editMindMap')"
                >
                  <SquarePen :size="18" />
                </UiButton>
              </UiTooltip>
            </div>
          </div>

          <!-- 卡片内容区域 -->
          <div @click="showFullscreen" class="px-5 py-4 flex-1 overflow-hidden relative">
            <div class="flex w-full relative">
              <svg
                ref="svgRef"
                class="box-border w-full h-[40vh] text-text-primary"
                draggable="false"
              />

              <!-- 渲染失败提示：避免失败时只剩一张空白 SVG -->
              <div
                v-if="renderError"
                class="absolute inset-2 z-1 p-3 text-sm text-semantic-danger rounded-lg overflow-auto"
                style="background: color-mix(in srgb, var(--semantic-danger) 10%, transparent)"
              >
                <p class="font-medium mb-1">{{ t('previewer.mindMapRenderError') }}</p>
                <p class="whitespace-pre-wrap break-words">{{ renderError }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="flex transition-opacity duration-xl text-text-secondary opacity-0 group-hover:opacity-100"
    >
      <div>
        <div class="mt-2 flex group">
          <!-- 复制按钮 -->
          <UiTooltip :text="t('chat.copy')">
            <UiButton
              icon
              type="button"
              class="btn-icon-action mx-1"
              @click="handleCopy"
              :aria-label="t('chat.copy')"
            >
              <Copy />
            </UiButton>
          </UiTooltip>

          <!-- 删除按钮 -->
          <UiTooltip :text="t('chat.delete')">
            <UiButton
              icon
              type="button"
              class="btn-icon-action mx-1"
              @click="handleDelete"
              :aria-label="t('chat.delete')"
            >
              <Trash2 />
            </UiButton>
          </UiTooltip>
        </div>
      </div>
    </div>
  </div>
</template>
