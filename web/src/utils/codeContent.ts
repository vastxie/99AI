import { slotKeys } from '@/packs'
import type { CodeContentType } from '@/types/preview-panel'

const KERNEL_PREVIEWABLE_TYPES = ['html', 'svg', 'markdown']
let previewableTypes: readonly string[] | null = null

/** 内核自带可预览类型 + 各扩展包登记的预览渲染器类型（preview.renderer 的 key），按需收集 */
export function previewableCodeContentTypes(): readonly string[] {
  if (!previewableTypes) {
    previewableTypes = Array.from(
      new Set([...KERNEL_PREVIEWABLE_TYPES, ...slotKeys('preview.renderer')])
    )
  }
  return previewableTypes
}

export type PreviewableCodeContentType = string

const CODE_BLOCK_CONTENT_TYPE_ALIASES: Record<string, CodeContentType> = {
  html: 'html',
  htm: 'html',
  svg: 'svg',
  markdown: 'markdown',
  md: 'markdown',
  json: 'json',
  css: 'css',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',
  sql: 'sql',
  python: 'python',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  c: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  rust: 'rust',
  rs: 'rust',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  text: 'text',
  txt: 'text',
  plaintext: 'text',
}

const CODE_CONTENT_TYPES = new Set<string>(Object.values(CODE_BLOCK_CONTENT_TYPE_ALIASES))

/** 是否为代码内容类型（html / svg / cpp / text …）：文件预览面板据此按纯文本预览，不渲染 */
export function isCodeContentType(value?: string): boolean {
  return CODE_CONTENT_TYPES.has(String(value || '').toLowerCase())
}

/** 文件路径专用别名：.vue 单文件组件按 HTML 高亮 / 预览；代码块语言 vue 不走此表 */
const FILE_TYPE_CONTENT_TYPE_ALIASES: Record<string, CodeContentType> = {
  vue: 'html',
}

/** 内核代码内容类型对应的下载扩展名；扩展包登记的预览类型由包自行补充 */
const CODE_CONTENT_TYPE_FILE_EXTENSIONS: Record<string, string> = {
  html: 'html',
  svg: 'svg',
  markdown: 'md',
  json: 'json',
  css: 'css',
  javascript: 'js',
  typescript: 'ts',
  sql: 'sql',
  python: 'py',
  java: 'java',
  cpp: 'cpp',
  rust: 'rs',
  bash: 'sh',
  text: 'txt',
}

/**
 * 工具输出 / 文件卡的 previewContentType、fileType 或扩展名 → 代码内容类型。
 * 大小写不敏感、允许前导点；未知回落 'text'。与代码块共用同一别名表，另加文件专用别名。
 */
export function getFileContentType(fileType?: string): CodeContentType {
  const normalized = String(fileType || '')
    .toLowerCase()
    .replace(/^\./u, '')
  return (
    CODE_BLOCK_CONTENT_TYPE_ALIASES[normalized] ||
    FILE_TYPE_CONTENT_TYPE_ALIASES[normalized] ||
    'text'
  )
}

/** 代码内容类型（或其别名）→ 下载文件扩展名；未知返回 undefined，由调用方决定回退 */
export function getCodeContentFileExtension(contentType?: string): string | undefined {
  const value = String(contentType || '')
  return CODE_CONTENT_TYPE_FILE_EXTENSIONS[CODE_BLOCK_CONTENT_TYPE_ALIASES[value] || value]
}

function normalizeCodeBlockLanguage(lang?: string) {
  return String(lang || 'text')
    .trim()
    .toLowerCase()
    .replace(/^language-/u, '')
}

export function getCodeBlockLanguageLabel(lang?: string) {
  return normalizeCodeBlockLanguage(lang) || 'text'
}

export function getCodeBlockContentType(lang?: string): CodeContentType {
  const normalized = normalizeCodeBlockLanguage(lang)
  if (previewableCodeContentTypes().includes(normalized)) return normalized
  return CODE_BLOCK_CONTENT_TYPE_ALIASES[normalized] || 'text'
}

export function isPreviewableCodeContentType(
  contentType: CodeContentType
): contentType is PreviewableCodeContentType {
  return previewableCodeContentTypes().includes(contentType)
}
