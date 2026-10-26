<script setup lang="ts">
import { Download, X } from '@lucide/vue'
import DOMPurify from 'dompurify'
import { createMarkdownIt } from '@/utils/markdown/createMarkdownIt'
// 压缩版 worker（约 1.3 MB，未压缩版约 2.2 MB），与 pdfjs-dist 同版本
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { WorkSheet } from 'xlsx'
import type { ComponentPublicInstance } from 'vue'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ActionIcon from '@/components/common/ActionIcon'
import UiSpinner from '@/components/common/UiSpinner.vue'
import { t } from '@/locales'
import type { FilePreviewSource } from '@/types/file-preview'

/** 网页文件与 HTML 代码块共用同一预览渲染器：隔离 iframe（无同源权限），拿不到本站凭据 */
const HtmlRenderer = defineAsyncComponent(() => import('../renderers/HtmlRenderer.vue'))
import { message } from '@/utils/message'
import { downloadBlob, downloadUrl } from '@/utils/download'
import { useSelectionQuote } from '@/views/chat/composables/useSelectionQuote'
import SelectionQuotePopover from '@/views/chat/components/SelectionQuotePopover.vue'
import { sheetColumnCount, type PreviewKind } from './filePreview.helpers'
import {
  assertPreviewSizeWithinLimit,
  getFileExtension,
  inferPreviewKind,
  isSameFilePreviewSource,
} from './filePreview.helpers'
import PanelHeader from '@/views/chat/components/UnifiedSidePanel/shared/PanelHeader.vue'

type SpreadsheetUtils = (typeof import('xlsx'))['utils']

type PreviewSheet = {
  name: string
  rows: string[][]
  totalRows: number
  totalColumns: number
  columnCount: number
}

type PdfPagePreview = {
  pageNumber: number
  dataUrl: string
  /** scale = 1 时的页面尺寸，面板宽度变化时按此重算展示尺寸 */
  baseWidth: number
  baseHeight: number
  width: number
  height: number
  textLayerHtml: string
}

type PreviewErrorKind = '' | 'failed' | 'too-large' | 'unsupported-format'

const MAX_SPREADSHEET_ROWS = 80
const MAX_SPREADSHEET_COLUMNS = 80
const MIN_SPREADSHEET_COLUMNS = 6
const PDF_RENDER_SCALE = 1.35
const PDF_MIN_RENDER_SCALE = 0.5
const PDF_RENDER_MAX_PIXEL_RATIO = 2
/** PDF 页面与预览区水平边距合计（1rem padding ×2 + 边框），用于按面板宽度自适应缩放 */
const PDF_FIT_HORIZONTAL_INSET = 34
const MAX_PDF_PREVIEW_PAGES = 120

const props = defineProps<{
  file: FilePreviewSource
  close: () => void
  quoteDisabled?: boolean
}>()

const ms = message()
const markdown = createMarkdownIt({ breaks: true })
// 独立净化实例：给预览内的链接补 target/rel，避免点击后整个应用被导航走；不污染全局 DOMPurify
const domPurify = DOMPurify(window)
domPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const panelRootRef = ref<HTMLElement | null>(null)
const previewBodyRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const downloading = ref(false)
const error = ref<PreviewErrorKind>('')
const objectUrl = ref('')
const textContent = ref('')
const renderedHtml = ref('')
const sheets = ref<PreviewSheet[]>([])
const pdfPages = ref<PdfPagePreview[]>([])
const pdfTotalPages = ref(0)
const pdfScale = ref(PDF_RENDER_SCALE)
const activeSheetName = ref('')
let loadRequestId = 0
let pdfDocument: import('pdfjs-dist').PDFDocumentProxy | null = null
/** 还在解析中的 PDF：面板关闭或换文件时一并销毁，否则它结束后会留下文档与 worker */
let pdfLoadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | null = null
let pdfjsLib: typeof import('pdfjs-dist') | null = null
let pdfPageObserver: IntersectionObserver | null = null
let pdfRenderQueue: number[] = []
let pdfRenderQueueActive = false
const previewBodyWidth = ref(0)
let bodyResizeObserver: ResizeObserver | null = null
let bodyResizeTimer: number | undefined

const fileName = computed(() => props.file.name || t('common.preview'))
const extension = computed(() => getFileExtension(props.file))
const previewKind = computed<PreviewKind>(() => inferPreviewKind(props.file))
const canDownload = computed(() =>
  Boolean(props.file.downloadFile || props.file.downloadUrl || props.file.loadBlob)
)
const activeSheet = computed(() => {
  return sheets.value.find(sheet => sheet.name === activeSheetName.value) || sheets.value[0] || null
})
const activeSheetTruncated = computed(() => {
  const sheet = activeSheet.value
  if (!sheet) return false
  return sheet.totalRows > sheet.rows.length || sheet.totalColumns > sheet.columnCount
})
const errorMessage = computed(() => {
  if (error.value === 'too-large') return t('previewer.fileTooLarge')
  if (error.value === 'unsupported-format') return t('previewer.unsupportedType')
  return t('previewer.loadFailed')
})

const {
  popover: selectionPopover,
  handleSelectionChange,
  hidePopover: hideSelectionPopover,
  quoteSelection: quoteSelectedText,
} = useSelectionQuote({
  hostRef: panelRootRef,
  isEligibleNode: node => !props.quoteDisabled && Boolean(previewBodyRef.value?.contains(node)),
  isEnabled: () => !props.quoteDisabled,
  resolveSourceTitle: () => fileName.value,
})

watch(
  () => props.file,
  (next, prev) => {
    // 同一文件重复打开不重载，避免 PDF 等重型内容整体重渲染；
    // 判等用完整签名而非仅 key（同名不同地址的附件 key 可能碰撞）
    if (prev && isSameFilePreviewSource(prev, next)) return
    void loadPreview()
  },
  { immediate: true }
)

onMounted(() => {
  // 面板宽度变化（打开动画结束、拖拽窗口、移动端旋转）后去抖更新，驱动 PDF 重新适配宽度
  bodyResizeObserver = new ResizeObserver(() => {
    window.clearTimeout(bodyResizeTimer)
    bodyResizeTimer = window.setTimeout(() => {
      previewBodyWidth.value = previewBodyRef.value?.clientWidth || 0
    }, 180)
  })
  if (previewBodyRef.value) bodyResizeObserver.observe(previewBodyRef.value)
})

onBeforeUnmount(() => {
  // 让进行中的加载全部失效，之后返回的结果一律丢弃
  loadRequestId += 1
  window.clearTimeout(bodyResizeTimer)
  bodyResizeObserver?.disconnect()
  bodyResizeObserver = null
  void destroyPdfDocument()
  revokeObjectUrl()
})

watch(previewBodyWidth, width => {
  if (width <= 0 || !pdfDocument || pdfPages.value.length === 0) return
  const firstPage = pdfPages.value[0]
  const nextScale = computePdfFitScale(firstPage.baseWidth, width)
  // 宽度抖动一两个像素不值得整体重渲
  if (Math.abs(nextScale - pdfScale.value) / pdfScale.value < 0.02) return
  applyPdfScale(nextScale)
})

function revokeObjectUrl() {
  if (!objectUrl.value || !objectUrl.value.startsWith('blob:')) return
  URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = ''
}

async function loadSourceBlob(source: FilePreviewSource): Promise<Blob> {
  if (source.loadBlob) return source.loadBlob()
  if (source.content !== undefined) {
    return new Blob([source.content], { type: source.mime || 'text/plain;charset=utf-8' })
  }

  const url = source.downloadUrl || source.previewUrl
  if (!url) throw new Error('Invalid file preview source')
  const response = await fetch(url)
  if (!response.ok) throw new Error('File preview request failed')
  return response.blob()
}

async function destroyPdfDocument() {
  pdfPageObserver?.disconnect()
  pdfPageObserver = null
  pdfRenderQueue = []

  const task = pdfLoadingTask
  pdfLoadingTask = null
  const doc = pdfDocument
  pdfDocument = null
  if (task) {
    try {
      await task.destroy()
    } catch {}
  }
  if (doc) {
    try {
      await doc.loadingTask.destroy()
    } catch {}
  }
  ;(pdfjsLib as any)?.TextLayer?.cleanup?.()
}

function computePdfFitScale(pageBaseWidth: number, containerWidth: number) {
  if (!pageBaseWidth || containerWidth <= PDF_FIT_HORIZONTAL_INSET * 2) return PDF_RENDER_SCALE
  const fitScale = (containerWidth - PDF_FIT_HORIZONTAL_INSET) / pageBaseWidth
  return Math.min(Math.max(fitScale, PDF_MIN_RENDER_SCALE), PDF_RENDER_SCALE)
}

/**
 * 等待预览区宽度稳定后再返回：面板打开有 450ms（--motion-duration-2xl）的宽度展开动画，
 * 动画途中测得的宽度会让 PDF 适配出过小的缩放
 */
async function measureSettledBodyWidth(requestId: number): Promise<number> {
  let last = previewBodyRef.value?.clientWidth || 0
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise(resolve => window.setTimeout(resolve, 120))
    if (requestId !== loadRequestId) return last
    const current = previewBodyRef.value?.clientWidth || 0
    if (current > 0 && Math.abs(current - last) <= 1) return current
    last = current
  }
  return last
}

/** 切换缩放：重算每页展示尺寸并清空已渲染位图，由懒加载按新尺寸重渲可见页 */
function applyPdfScale(scale: number) {
  pdfScale.value = scale
  pdfRenderQueue = []
  pdfPages.value = pdfPages.value.map(page => ({
    ...page,
    dataUrl: '',
    textLayerHtml: '',
    width: page.baseWidth * scale,
    height: page.baseHeight * scale,
  }))
}

/**
 * 打开 PDF：只解析文档结构与每页尺寸生成占位（首屏立即可见），
 * 页面位图与文本层由 IntersectionObserver 滚动到附近时按需渲染。
 */
/**
 * pdf.js 的 CMap、标准字体、wasm 解码器与 ICC 配置：由 vite 的运行时资源插件发布在站点下的 pdfjs/。
 * 在主线程解析成绝对地址再交给 worker（相对地址会被 worker 按自己所在目录解析）。站点 base 为相对路径（./）时，
 * 页面地址随 history 路由的层级变化（如 /c/:id），改以本模块的构建产物为锚点：JS 分块在站点下的 assets/，
 * 与 pdfjs/ 同级。开发模式与绝对 base 直接按 base 解析。
 */
function resolvePdfjsAssetBaseUrl() {
  const base = import.meta.env.BASE_URL || '/'
  if (import.meta.env.PROD && base.startsWith('.')) {
    return new URL('../pdfjs/', import.meta.url).href
  }
  return new URL(`${base.endsWith('/') ? base : `${base}/`}pdfjs/`, window.location.origin).href
}

async function openPdfPreview(blob: Blob, requestId: number) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  pdfjsLib = pdfjs

  const data = new Uint8Array(await blob.arrayBuffer())
  // 面板已关闭或换了文件：不再创建加载任务（它会启动一个 worker）
  if (requestId !== loadRequestId) return
  const assetBaseUrl = resolvePdfjsAssetBaseUrl()
  const loadingTask = pdfjs.getDocument({
    data,
    cMapUrl: `${assetBaseUrl}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBaseUrl}standard_fonts/`,
    // 扫描件常用的 JBIG2 与 JPEG 2000 图像由 wasm 解码
    wasmUrl: `${assetBaseUrl}wasm/`,
    iccUrl: `${assetBaseUrl}iccs/`,
  })
  pdfLoadingTask = loadingTask
  let doc: import('pdfjs-dist').PDFDocumentProxy
  try {
    doc = await loadingTask.promise
  } catch (error) {
    // 解析失败也要销毁加载任务，否则它创建的 worker 不会退出
    if (pdfLoadingTask === loadingTask) pdfLoadingTask = null
    void loadingTask.destroy().catch(() => {})
    throw error
  }
  if (pdfLoadingTask === loadingTask) pdfLoadingTask = null
  if (requestId !== loadRequestId) {
    try {
      await loadingTask.destroy()
    } catch {}
    return
  }
  pdfDocument = doc

  const firstPage = await doc.getPage(1)
  if (requestId !== loadRequestId) return
  const baseViewport = firstPage.getViewport({ scale: 1 })
  const containerWidth = await measureSettledBodyWidth(requestId)
  if (requestId !== loadRequestId) return
  pdfScale.value = computePdfFitScale(baseViewport.width, containerWidth)

  pdfTotalPages.value = doc.numPages
  const pageCount = Math.min(doc.numPages, MAX_PDF_PREVIEW_PAGES)
  const placeholders: PdfPagePreview[] = []
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = pageNumber === 1 ? firstPage : await doc.getPage(pageNumber)
    if (requestId !== loadRequestId) return
    const pageBaseViewport = page.getViewport({ scale: 1 })
    placeholders.push({
      pageNumber,
      dataUrl: '',
      baseWidth: pageBaseViewport.width,
      baseHeight: pageBaseViewport.height,
      width: pageBaseViewport.width * pdfScale.value,
      height: pageBaseViewport.height * pdfScale.value,
      textLayerHtml: '',
    })
  }
  pdfPages.value = placeholders
}

function ensurePdfPageObserver(): IntersectionObserver {
  if (pdfPageObserver) return pdfPageObserver
  pdfPageObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const pageNumber = Number((entry.target as HTMLElement).dataset.pdfPage)
        if (pageNumber > 0) enqueuePdfPageRender(pageNumber)
        pdfPageObserver?.unobserve(entry.target)
      }
    },
    { root: previewBodyRef.value, rootMargin: '600px 0px' }
  )
  return pdfPageObserver
}

function observePdfPage(element: Element | ComponentPublicInstance | null, pageNumber: number) {
  if (!element || !(element instanceof HTMLElement)) return
  const page = pdfPages.value[pageNumber - 1]
  if (!page || page.dataUrl) return
  element.dataset.pdfPage = String(pageNumber)
  ensurePdfPageObserver().observe(element)
}

function enqueuePdfPageRender(pageNumber: number) {
  const page = pdfPages.value[pageNumber - 1]
  if (!page || page.dataUrl || pdfRenderQueue.includes(pageNumber)) return
  pdfRenderQueue.push(pageNumber)
  void drainPdfRenderQueue()
}

/** 渲染队列串行化：避免多页并发渲染造成 canvas 内存峰值 */
async function drainPdfRenderQueue() {
  if (pdfRenderQueueActive) return
  pdfRenderQueueActive = true
  try {
    while (pdfRenderQueue.length > 0 && pdfDocument) {
      const pageNumber = pdfRenderQueue.shift()!
      try {
        await renderPdfPage(pageNumber)
      } catch {}
    }
  } finally {
    pdfRenderQueueActive = false
  }
}

async function renderPdfPage(pageNumber: number) {
  const doc = pdfDocument
  const pdfjs = pdfjsLib
  if (!doc || !pdfjs) return
  const requestId = loadRequestId
  const scale = pdfScale.value

  const page = await doc.getPage(pageNumber)
  const pixelRatio = Math.min(window.devicePixelRatio || 1, PDF_RENDER_MAX_PIXEL_RATIO)
  const viewport = page.getViewport({ scale })
  const renderViewport = page.getViewport({ scale: scale * pixelRatio })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return

  canvas.width = Math.max(1, Math.floor(renderViewport.width))
  canvas.height = Math.max(1, Math.floor(renderViewport.height))
  await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise
  if (requestId !== loadRequestId) return

  const textLayerContainer = document.createElement('div')
  textLayerContainer.className = 'textLayer'
  const textContent = await page.getTextContent()
  const textLayer = new (pdfjs as any).TextLayer({
    textContentSource: textContent,
    container: textLayerContainer,
    viewport,
  })
  await textLayer.render()
  // 渲染期间请求被取消或缩放已变化时丢弃本次结果（变化后的占位会被懒加载重新入队）
  if (requestId !== loadRequestId || scale !== pdfScale.value) return

  const target = pdfPages.value[pageNumber - 1]
  if (!target) return
  target.dataUrl = canvas.toDataURL('image/png')
  target.textLayerHtml = textLayerContainer.innerHTML
  page.cleanup()
}

async function hydrateMediaObjectUrl(source: FilePreviewSource, requestId: number) {
  const blob = await loadSourceBlob(source)
  if (requestId !== loadRequestId) return
  revokeObjectUrl()
  objectUrl.value = URL.createObjectURL(blob)
}

function resolvePreviewError(err: unknown): PreviewErrorKind {
  const code = err instanceof Error ? err.message : ''
  return code === 'too-large' || code === 'unsupported-format' ? code : 'failed'
}

async function loadPreview() {
  const source = props.file
  const kind = previewKind.value
  const requestId = ++loadRequestId

  hideSelectionPopover()
  void destroyPdfDocument()
  revokeObjectUrl()
  objectUrl.value = ''
  error.value = ''
  textContent.value = ''
  renderedHtml.value = ''
  sheets.value = []
  pdfPages.value = []
  pdfTotalPages.value = 0
  activeSheetName.value = ''

  if (kind === 'unsupported') return

  // 媒体直链优先（含本地 base64），加载失败由 handleMediaDisplayError 回落到鉴权 blob
  if (['image', 'video', 'audio'].includes(kind)) {
    if (source.previewUrl) {
      objectUrl.value = source.previewUrl
      return
    }

    loading.value = true
    try {
      await hydrateMediaObjectUrl(source, requestId)
    } catch {
      if (requestId === loadRequestId) error.value = 'failed'
    } finally {
      if (requestId === loadRequestId) loading.value = false
    }
    return
  }

  loading.value = true
  try {
    // 双重大小门槛：来源声明的 size 在下载前拦截，blob.size 兜底声明缺失或不实的情况
    assertPreviewSizeWithinLimit(kind, Number(source.size) || undefined)
    const blob = await loadSourceBlob(source)
    if (requestId !== loadRequestId) return
    assertPreviewSizeWithinLimit(kind, blob.size)

    if (kind === 'pdf') {
      await openPdfPreview(blob, requestId)
      return
    }

    if (kind === 'spreadsheet') {
      const parsedSheets = await loadSpreadsheetPreview(blob)
      if (requestId !== loadRequestId) return
      sheets.value = parsedSheets
      activeSheetName.value = parsedSheets[0]?.name || ''
      return
    }

    if (kind === 'word') {
      const html = await loadWordPreview(blob)
      if (requestId !== loadRequestId) return
      renderedHtml.value = domPurify.sanitize(html)
      return
    }

    if (kind === 'markdown') {
      const content = await readTextBlob(blob)
      if (requestId !== loadRequestId) return
      textContent.value = content
      renderedHtml.value = domPurify.sanitize(markdown.render(content))
      return
    }

    if (kind === 'text' || kind === 'html') {
      textContent.value = await readTextBlob(blob)
    }
  } catch (err) {
    if (requestId === loadRequestId) error.value = resolvePreviewError(err)
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

/** 媒体直链加载失败：回落到 blob 水合，blob 也失败则进入错误态 */
async function handleMediaDisplayError() {
  const source = props.file
  if (!objectUrl.value || objectUrl.value.startsWith('blob:')) {
    error.value = 'failed'
    return
  }
  if (!source.loadBlob && source.content === undefined && !source.downloadUrl) {
    error.value = 'failed'
    return
  }

  const requestId = loadRequestId
  loading.value = true
  try {
    await hydrateMediaObjectUrl(source, requestId)
  } catch {
    if (requestId === loadRequestId) error.value = 'failed'
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

async function readTextBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  // 严格 UTF-8 解码失败时回落 GBK，避免中文本地文件乱码
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer)
    } catch {
      return new TextDecoder('utf-8').decode(buffer)
    }
  }
}

async function loadSpreadsheetPreview(blob: Blob): Promise<PreviewSheet[]> {
  const spreadsheet = await import('xlsx')
  const workbook = spreadsheet.read(await blob.arrayBuffer(), {
    type: 'array',
    cellDates: true,
  })

  return workbook.SheetNames.map(name => parseSheet(name, workbook.Sheets[name], spreadsheet.utils))
}

function parseSheet(name: string, worksheet: WorkSheet, utils: SpreadsheetUtils): PreviewSheet {
  const rangeSize = getSheetRangeSize(worksheet, utils)
  const rawRows = utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  })
  const totalColumns = sheetColumnCount(rangeSize.columns, rawRows)
  const columnCount = Math.min(
    Math.max(totalColumns, MIN_SPREADSHEET_COLUMNS),
    MAX_SPREADSHEET_COLUMNS
  )
  const rows = rawRows
    .slice(0, MAX_SPREADSHEET_ROWS)
    .map(row => Array.from({ length: columnCount }, (_, index) => formatCellValue(row[index])))

  return {
    name,
    rows,
    totalRows: Math.max(rangeSize.rows, rawRows.length),
    totalColumns,
    columnCount,
  }
}

function getSheetRangeSize(worksheet: WorkSheet, utils: SpreadsheetUtils) {
  const worksheetRef = worksheet['!ref']
  if (!worksheetRef) return { rows: 0, columns: 0 }

  try {
    const range = utils.decode_range(worksheetRef)
    return {
      rows: range.e.r - range.s.r + 1,
      columns: range.e.c - range.s.c + 1,
    }
  } catch {
    return { rows: 0, columns: 0 }
  }
}

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

function getColumnName(index: number) {
  let name = ''
  let current = index + 1

  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCodePoint(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }

  return name
}

async function loadWordPreview(blob: Blob): Promise<string> {
  if (extension.value === 'doc') {
    throw new Error('unsupported-format')
  }

  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
  return result.value || ''
}

async function handleDownload() {
  if (downloading.value) return

  downloading.value = true
  try {
    if (props.file.downloadFile) {
      await props.file.downloadFile()
      return
    }

    if (props.file.loadBlob || props.file.content !== undefined) {
      downloadBlob(await loadSourceBlob(props.file), fileName.value)
      return
    }

    const url = props.file.downloadUrl || props.file.previewUrl
    if (url) downloadUrl(url, fileName.value)
  } catch {
    ms.error(t('common.downloadFailed'))
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div ref="panelRootRef" class="panel-shell">
    <PanelHeader title="" :show-close="false" @close="close">
      <template #tabs>
        <div class="type-control flex min-w-0 items-center gap-1 truncate">
          <span class="min-w-0 truncate text-text-primary" :title="fileName">{{ fileName }}</span>
        </div>
      </template>
      <template #actions>
        <ActionIcon
          v-if="canDownload"
          :label="t('common.downloadNamed', { name: fileName })"
          @click="handleDownload"
        >
          <UiSpinner v-if="downloading" :size="18" />
          <Download v-else :size="18" />
        </ActionIcon>
        <ActionIcon :label="t('common.close')" @click="close">
          <X :size="20" />
        </ActionIcon>
      </template>
    </PanelHeader>

    <main
      ref="previewBodyRef"
      class="file-preview-body custom-scrollbar"
      @mouseup="handleSelectionChange"
      @keyup="handleSelectionChange"
      @scroll="hideSelectionPopover"
    >
      <div v-if="loading" class="file-preview-state">
        <UiSpinner size="md" />
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="file-preview-state">
        <span>{{ errorMessage }}</span>
        <button
          v-if="error === 'failed'"
          type="button"
          class="file-preview-link"
          @click="loadPreview"
        >
          {{ t('common.retry') }}
        </button>
        <button v-if="canDownload" type="button" class="file-preview-link" @click="handleDownload">
          {{ t('common.download') }}
        </button>
      </div>

      <img
        v-else-if="previewKind === 'image' && objectUrl"
        class="file-preview-image"
        :src="objectUrl"
        :alt="fileName"
        @error="handleMediaDisplayError"
      />

      <video
        v-else-if="previewKind === 'video' && objectUrl"
        class="file-preview-video"
        :src="objectUrl"
        controls
        preload="metadata"
        @error="handleMediaDisplayError"
      />

      <div v-else-if="previewKind === 'audio' && objectUrl" class="file-preview-audio-wrap">
        <audio
          class="file-preview-audio"
          :src="objectUrl"
          controls
          preload="metadata"
          @error="handleMediaDisplayError"
        />
      </div>

      <section
        v-else-if="previewKind === 'pdf' && pdfPages.length > 0"
        class="file-preview-pdf-pages"
        :aria-label="fileName"
      >
        <div
          v-for="page in pdfPages"
          :key="page.pageNumber"
          :ref="element => observePdfPage(element, page.pageNumber)"
          class="file-preview-pdf-page"
          :style="{ width: `${page.width}px`, aspectRatio: `${page.width} / ${page.height}` }"
        >
          <img
            v-if="page.dataUrl"
            class="file-preview-pdf-page-image"
            :src="page.dataUrl"
            :alt="`${fileName} ${page.pageNumber}`"
          />
          <div v-else class="file-preview-pdf-page-placeholder">
            <UiSpinner :size="18" />
          </div>
          <div
            v-if="page.textLayerHtml"
            class="textLayer file-preview-pdf-text-layer"
            :style="{ '--total-scale-factor': String(pdfScale) }"
            v-html="page.textLayerHtml"
          ></div>
        </div>
        <p v-if="pdfTotalPages > pdfPages.length" class="file-preview-truncate-note">
          {{ t('previewer.pdfTruncated', { pages: pdfPages.length }) }}
        </p>
      </section>

      <section v-else-if="previewKind === 'spreadsheet' && activeSheet" class="file-preview-sheet">
        <div v-if="sheets.length > 1" class="file-preview-sheet-tabs custom-scrollbar">
          <button
            v-for="sheet in sheets"
            :key="sheet.name"
            type="button"
            class="file-preview-sheet-tab"
            :class="{ 'is-active': sheet.name === activeSheet.name }"
            @click="activeSheetName = sheet.name"
          >
            {{ sheet.name }}
          </button>
        </div>
        <div class="file-preview-sheet-scroll custom-scrollbar">
          <table class="file-preview-sheet-table">
            <thead>
              <tr>
                <th class="file-preview-sheet-corner"></th>
                <th v-for="colIndex in activeSheet.columnCount" :key="`col-${colIndex}`">
                  {{ getColumnName(colIndex - 1) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, rowIndex) in activeSheet.rows"
                :key="`row-${rowIndex}`"
                :class="{ 'is-header-row': rowIndex === 0 }"
              >
                <th>{{ rowIndex + 1 }}</th>
                <td
                  v-for="colIndex in activeSheet.columnCount"
                  :key="`cell-${rowIndex}-${colIndex}`"
                  :title="row[colIndex - 1] || undefined"
                >
                  {{ row[colIndex - 1] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="activeSheetTruncated" class="file-preview-truncate-note file-preview-sheet-note">
          {{
            t('previewer.sheetTruncated', {
              rows: activeSheet.rows.length,
              cols: Math.min(activeSheet.columnCount, activeSheet.totalColumns),
              totalRows: activeSheet.totalRows,
              totalCols: activeSheet.totalColumns,
            })
          }}
        </p>
      </section>

      <article
        v-else-if="(previewKind === 'word' || previewKind === 'markdown') && renderedHtml"
        class="file-preview-document md-prose"
        v-html="renderedHtml"
      ></article>

      <div v-else-if="previewKind === 'html' && textContent" class="file-preview-html">
        <HtmlRenderer :content="textContent" />
      </div>

      <pre v-else-if="previewKind === 'text'" class="file-preview-text">{{ textContent }}</pre>

      <div v-else class="file-preview-state">
        <span>{{ t('previewer.unsupportedType') }}</span>
        <button v-if="canDownload" type="button" class="file-preview-link" @click="handleDownload">
          {{ t('common.download') }}
        </button>
      </div>
    </main>

    <SelectionQuotePopover
      :visible="selectionPopover.visible"
      :top="selectionPopover.top"
      :left="selectionPopover.left"
      :placement="selectionPopover.placement"
      @quote="quoteSelectedText"
    />
  </div>
</template>

<style scoped>
.panel-shell {
  position: relative;
}

.file-preview-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  background: var(--app-surface-sunken);
}

.file-preview-state {
  display: flex;
  height: 100%;
  min-height: 14rem;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  color: var(--text-muted);
  font-size: var(--type-body-sm-size);
}

.file-preview-link {
  color: var(--text-link);
  font-weight: 600;
}

.file-preview-image,
.file-preview-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.file-preview-audio-wrap {
  display: flex;
  height: 100%;
  min-height: 14rem;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.file-preview-audio {
  width: min(32rem, 100%);
}

.file-preview-pdf-pages {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--app-surface-sunken);
}

.file-preview-pdf-page {
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-md);
  background: #ffffff; /* design-guard-allow: PDF 页面模拟白纸，明暗主题下都固定为白 */
  box-shadow: var(--component-shadow-sm);
}

.file-preview-pdf-page-image {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}

.file-preview-pdf-page-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.file-preview-truncate-note {
  margin: 0;
  padding: 0.1rem 0.75rem 0.4rem;
  color: var(--text-muted);
  font-size: var(--type-caption-size);
  text-align: center;
}

.file-preview-sheet-note {
  border-top: 1px solid var(--app-border);
  padding: 0.45rem 0.75rem;
  background: var(--app-surface);
  text-align: left;
}

.textLayer {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: clip;
  line-height: 1;
  text-align: initial;
  text-size-adjust: none;
  transform-origin: 0 0;
  forced-color-adjust: none;
}

.textLayer :is(span, br) {
  position: absolute;
  color: transparent;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
}

.textLayer > :not(.markedContent),
.textLayer .markedContent span:not(.markedContent) {
  z-index: 1;
}

.textLayer span.markedContent {
  top: 0;
  height: 0;
}

.textLayer span[role='img'] {
  cursor: default;
  user-select: none;
}

.textLayer ::selection {
  background: color-mix(in srgb, AccentColor, transparent 75%);
}

.textLayer br::selection {
  background: transparent;
}

.textLayer .endOfContent {
  position: absolute;
  inset: 100% 0 0;
  z-index: 0;
  display: block;
  cursor: default;
  user-select: none;
}

.file-preview-sheet {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.file-preview-sheet-tabs {
  display: flex;
  gap: 0.4rem;
  border-bottom: 1px solid var(--app-border);
  padding: 0.5rem 0.75rem;
  overflow-x: auto;
  background: var(--app-surface);
}

.file-preview-sheet-tab {
  flex: 0 0 auto;
  border-radius: var(--radius-full);
  padding: 0.32rem 0.75rem;
  color: var(--text-muted);
  font-size: var(--type-caption-size);
  font-weight: 600;
}

.file-preview-sheet-tab:hover {
  color: var(--control-fg-hover);
  background: var(--interaction-bg-hover);
}

.file-preview-sheet-tab.is-active {
  color: var(--control-fg-selected);
  background: var(--control-bg-selected);
}

.file-preview-sheet-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0.75rem;
}

.file-preview-sheet-table {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--text-secondary);
  font-size: var(--type-caption-size);
  line-height: 1.2rem;
  background: var(--app-surface);
}

.file-preview-sheet-table th,
.file-preview-sheet-table td {
  max-width: 18rem;
  min-width: 7rem;
  border-right: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
  padding: 0.42rem 0.55rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-sheet-table thead th,
.file-preview-sheet-table tbody th {
  position: sticky;
  z-index: 1;
  color: var(--text-muted);
  font-weight: 700;
  background: var(--app-surface-elevated);
}

.file-preview-sheet-table thead th {
  top: 0;
}

.file-preview-sheet-table tbody th {
  left: 0;
  min-width: 3.25rem;
  text-align: center;
}

.file-preview-sheet-corner {
  left: 0;
  z-index: 2 !important;
  min-width: 3.25rem !important;
}

.file-preview-sheet-table tr.is-header-row td {
  color: var(--text-primary);
  font-weight: 600;
}

.file-preview-document {
  width: min(56rem, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 1.5rem;
  color: var(--text-primary);
  background: var(--app-surface);
}

.file-preview-html {
  height: 100%;
  min-height: 28rem;
}

.file-preview-text {
  min-height: 100%;
  margin: 0;
  padding: 1.1rem;
  overflow: auto;
  color: var(--text-primary);
  background: var(--app-surface);
  font-size: var(--type-meta-size);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
