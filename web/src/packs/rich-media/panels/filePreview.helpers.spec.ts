import { describe, expect, it } from 'vitest'
import type { FilePreviewSource } from '@/types/file-preview'
import {
  assertPreviewSizeWithinLimit,
  getFileExtension,
  inferPreviewKind,
  isSameFilePreviewSource,
  PREVIEW_SIZE_LIMITS,
  sheetColumnCount,
} from './filePreview.helpers'

function source(overrides: Partial<FilePreviewSource> = {}): FilePreviewSource {
  return {
    name: 'file.bin',
    sourceKind: 'public-url',
    ...overrides,
  }
}

describe('getFileExtension', () => {
  it('显式 extension 优先，并去掉前导点、统一小写', () => {
    expect(getFileExtension(source({ extension: '.PDF', name: 'a.docx' }))).toBe('pdf')
  })

  it('无显式 extension 时取文件名后缀', () => {
    expect(getFileExtension(source({ name: 'report.final.XLSX' }))).toBe('xlsx')
  })

  it('文件名无后缀时回落 mime 子类型', () => {
    expect(getFileExtension(source({ name: 'noext', mime: 'application/pdf' }))).toBe('pdf')
  })

  it('全部缺失时返回空串', () => {
    expect(getFileExtension(source({ name: 'noext' }))).toBe('')
  })
})

describe('inferPreviewKind', () => {
  it('mime 优先于扩展名判定媒体类型', () => {
    expect(inferPreviewKind(source({ name: 'photo.bin', mime: 'image/png' }))).toBe('image')
    expect(inferPreviewKind(source({ name: 'clip.bin', mime: 'video/mp4' }))).toBe('video')
    expect(inferPreviewKind(source({ name: 'voice.bin', mime: 'audio/mpeg' }))).toBe('audio')
  })

  it('按扩展名识别 pdf / 表格 / word / markdown', () => {
    expect(inferPreviewKind(source({ name: 'doc.pdf' }))).toBe('pdf')
    expect(inferPreviewKind(source({ name: 'data.csv' }))).toBe('spreadsheet')
    expect(inferPreviewKind(source({ name: 'paper.docx' }))).toBe('word')
    expect(inferPreviewKind(source({ name: 'README.md' }))).toBe('markdown')
  })

  it('contentType 可在无扩展名时判定 word / markdown / text', () => {
    expect(inferPreviewKind(source({ name: 'noext', contentType: 'word' }))).toBe('word')
    expect(inferPreviewKind(source({ name: 'noext', contentType: 'markdown' }))).toBe('markdown')
    expect(inferPreviewKind(source({ name: 'noext', contentType: 'text' }))).toBe('text')
  })

  it('网页文件交给隔离 iframe 渲染（与 HTML 代码块同一渲染器）；代码文件按纯文本预览', () => {
    expect(inferPreviewKind(source({ name: 'page.html' }))).toBe('html')
    expect(inferPreviewKind(source({ name: 'LAUNCH.HTM' }))).toBe('html')
    expect(inferPreviewKind(source({ name: 'noext', mime: 'text/html' } as any))).toBe('html')
    expect(inferPreviewKind(source({ name: 'main.ts' }))).toBe('text')
    expect(() => assertPreviewSizeWithinLimit('html', 4 * 1024 * 1024)).toThrow('too-large')
  })

  it('文件卡推出的代码 contentType（svg / cpp）在无 mime 时仍按纯文本预览', () => {
    expect(inferPreviewKind(source({ name: 'icon.svg', contentType: 'svg' }))).toBe('text')
    expect(inferPreviewKind(source({ name: 'main.cc', contentType: 'cpp' }))).toBe('text')
    expect(inferPreviewKind(source({ name: 'noext', contentType: 'cpp' }))).toBe('text')
    expect(inferPreviewKind(source({ name: 'blob.bin', contentType: 'word' }))).toBe('word')
  })

  it('未知类型返回 unsupported', () => {
    expect(inferPreviewKind(source({ name: 'archive.zip' }))).toBe('unsupported')
  })
})

describe('assertPreviewSizeWithinLimit', () => {
  it('pdf / word / markdown 超限抛 too-large', () => {
    expect(() => assertPreviewSizeWithinLimit('pdf', PREVIEW_SIZE_LIMITS.pdf! + 1)).toThrow(
      'too-large'
    )
    expect(() => assertPreviewSizeWithinLimit('word', PREVIEW_SIZE_LIMITS.word! + 1)).toThrow(
      'too-large'
    )
    expect(() =>
      assertPreviewSizeWithinLimit('markdown', PREVIEW_SIZE_LIMITS.markdown! + 1)
    ).toThrow('too-large')
  })

  it('恰好等于上限不抛', () => {
    expect(() => assertPreviewSizeWithinLimit('pdf', PREVIEW_SIZE_LIMITS.pdf!)).not.toThrow()
  })

  it('媒体类型与未知大小不受限', () => {
    expect(() => assertPreviewSizeWithinLimit('image', Number.MAX_SAFE_INTEGER)).not.toThrow()
    expect(() => assertPreviewSizeWithinLimit('pdf', undefined)).not.toThrow()
    expect(() => assertPreviewSizeWithinLimit('pdf', Number.NaN)).not.toThrow()
  })
})

describe('isSameFilePreviewSource', () => {
  const base = source({
    key: 'report.pdf',
    name: 'report.pdf',
    downloadUrl: 'https://files.example.com/a.pdf',
  })

  it('key 与内容地址都一致才视为同一来源', () => {
    expect(isSameFilePreviewSource(base, { ...base })).toBe(true)
  })

  it('同名同 key 但下载地址不同（key 碰撞场景）必须重载', () => {
    expect(
      isSameFilePreviewSource(base, { ...base, downloadUrl: 'https://files.example.com/b.pdf' })
    ).toBe(false)
  })

  it('previewUrl / content / sourceKind 任一不同都不算同一来源', () => {
    expect(isSameFilePreviewSource(base, { ...base, previewUrl: 'https://x/p.png' })).toBe(false)
    expect(isSameFilePreviewSource(base, { ...base, content: 'inline' })).toBe(false)
    expect(isSameFilePreviewSource(base, { ...base, sourceKind: 'private-file' })).toBe(false)
  })

  it('缺失 key 时永远视为不同来源（总是重载）', () => {
    const keyless = { ...base, key: undefined }
    expect(isSameFilePreviewSource(keyless, { ...keyless })).toBe(false)
  })
})

describe('sheetColumnCount', () => {
  it('counts columns over hundreds of thousands of rows without spreading them into arguments', () => {
    const rows = Array.from({ length: 200_000 }, () => ['x'])
    rows[150_000] = ['a', 'b', 'c']
    expect(sheetColumnCount(0, rows)).toBe(3)
    // 稀疏表：工作表范围比任何一行都宽
    expect(sheetColumnCount(7, [['a'], []])).toBe(7)
    expect(sheetColumnCount(-1, [])).toBe(0)
  })
})
