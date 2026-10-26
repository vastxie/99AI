import { describe, expect, it, vi } from 'vitest'
import {
  getCodeBlockContentType,
  getCodeContentFileExtension,
  getFileContentType,
  isCodeContentType,
} from './codeContent'

// 内核测试不装载扩展包注册表：可预览类型只含内核自带的 html / svg / markdown
vi.mock('@/packs', () => ({ slotKeys: () => [] }))

/** 合并前活动时间线（activityTimeline.ts）自带的映射表，逐键锁定返回值 */
const ACTIVITY_TIMELINE_TABLE: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  sql: 'sql',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  java: 'java',
  c: 'cpp',
  cpp: 'cpp',
  rs: 'rust',
  rust: 'rust',
}

/** 合并前消息文件卡（MediaOutput.vue）自带的映射表 */
const MEDIA_OUTPUT_TABLE: Record<string, string> = {
  html: 'html',
  css: 'css',
  json: 'json',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  markdown: 'markdown',
  md: 'markdown',
  sql: 'sql',
  python: 'python',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  rust: 'rust',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yaml: 'text',
  yml: 'text',
  xml: 'text',
  toml: 'text',
  vue: 'html',
  jsx: 'javascript',
  tsx: 'typescript',
  text: 'text',
  txt: 'text',
}

/** 合并前工具详情（ToolExecutionDetail.vue）自带的映射表 */
const TOOL_DETAIL_TABLE: Record<string, string> = {
  html: 'html',
  css: 'css',
  json: 'json',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  markdown: 'markdown',
  md: 'markdown',
  sql: 'sql',
  python: 'python',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'cpp',
  rust: 'rust',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  text: 'text',
  txt: 'text',
}

/** 合并前代码工作台下载表里的内核类型部分（扩展包登记的类型仍由包内表负责） */
const DOWNLOAD_EXTENSION_TABLE: Record<string, string> = {
  html: 'html',
  svg: 'svg',
  css: 'css',
  json: 'json',
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  markdown: 'md',
  md: 'md',
  sql: 'sql',
  python: 'py',
  py: 'py',
  java: 'java',
  cpp: 'cpp',
  rust: 'rs',
  bash: 'sh',
  text: 'txt',
}

describe('文件类型 → 代码内容类型单源', () => {
  it.each([
    ['活动时间线', ACTIVITY_TIMELINE_TABLE],
    ['消息文件卡', MEDIA_OUTPUT_TABLE],
    ['工具详情', TOOL_DETAIL_TABLE],
  ])('%s 合并前映射表的每个键返回值不变', (_name, table) => {
    for (const [key, expected] of Object.entries(table)) {
      expect(getFileContentType(key), key).toBe(expected)
    }
  })

  it('大小写不敏感、允许前导点，空值与未知类型回落 text', () => {
    expect(getFileContentType('.MD')).toBe('markdown')
    expect(getFileContentType('.Py')).toBe('python')
    expect(getFileContentType('')).toBe('text')
    expect(getFileContentType(undefined)).toBe('text')
    expect(getFileContentType('unknown-ext')).toBe('text')
    expect(getFileContentType('docx')).toBe('text')
  })

  it('并集：文件路径同样识别代码块别名表里的 svg / htm / c++ / plaintext 等', () => {
    expect(getFileContentType('svg')).toBe('svg')
    expect(getFileContentType('htm')).toBe('html')
    expect(getFileContentType('c++')).toBe('cpp')
    expect(getFileContentType('cxx')).toBe('cpp')
    expect(getFileContentType('plaintext')).toBe('text')
  })

  it('.vue 只在文件路径按 HTML 处理，代码块语言 vue 仍是纯文本', () => {
    expect(getFileContentType('vue')).toBe('html')
    expect(getCodeBlockContentType('vue')).toBe('text')
    expect(getCodeBlockContentType('language-ts')).toBe('typescript')
    expect(getCodeBlockContentType(' HTML ')).toBe('html')
  })
})

describe('代码内容类型 → 下载扩展名', () => {
  it('合并前下载表的内核类型返回值不变，别名归并到规范扩展名', () => {
    for (const [key, expected] of Object.entries(DOWNLOAD_EXTENSION_TABLE)) {
      expect(getCodeContentFileExtension(key), key).toBe(expected)
    }
    expect(getCodeContentFileExtension('rs')).toBe('rs')
    expect(getCodeContentFileExtension('shell')).toBe('sh')
    // 旧表把 c 单列为 .c；面板收到的类型都已由生产方归并为 cpp，此处随别名表统一
    expect(getCodeContentFileExtension('c')).toBe('cpp')
  })

  it('未知类型返回 undefined，由调用方决定回退', () => {
    expect(getCodeContentFileExtension('')).toBeUndefined()
    expect(getCodeContentFileExtension(undefined)).toBeUndefined()
    expect(getCodeContentFileExtension('word')).toBeUndefined()
  })
})

describe('isCodeContentType', () => {
  it('识别共用别名表里的代码内容类型，其它预览类型与空值为 false', () => {
    for (const value of ['cpp', 'svg', 'html', 'text', 'JSON']) {
      expect(isCodeContentType(value)).toBe(true)
    }
    for (const value of ['word', 'image', '', undefined]) {
      expect(isCodeContentType(value)).toBe(false)
    }
  })
})
