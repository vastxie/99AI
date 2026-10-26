import { describe, expect, it } from 'vitest'
import {
  assetToOutputFile,
  dedupeOutputFiles,
  hasFileTarget,
  isImageOutputFile,
  isVideoOutputFile,
  outputFileExtension,
  outputFileName,
  parseOutputFiles,
  readFileField,
} from './outputFile'

describe('文件描述的解析', () => {
  it('文件字段接受数组、对象、JSON 字符串与逗号分隔的地址', () => {
    expect(readFileField('["a.png","b.png"]')).toEqual(['a.png', 'b.png'])
    expect(readFileField('a.png, b.png')).toEqual(['a.png', 'b.png'])
    expect(readFileField('{"name":"x"}')).toEqual([{ name: 'x' }])
    expect(readFileField([{ url: 'a' }])).toEqual([{ url: 'a' }])
    expect(readFileField(null)).toEqual([])
    // 能解析成 JSON 的字符串不再当成地址拆分
    expect(readFileField('[]')).toEqual([])
    expect(readFileField('null')).toEqual([])
  })

  it('预览字段不拆地址：不是 JSON 的字符串不算预览', () => {
    expect(readFileField('[{"previewContent":"x"}]', { splitUrls: false })).toEqual([
      { previewContent: 'x' },
    ])
    expect(readFileField('not json', { splitUrls: false })).toEqual([])
  })

  it('只留下能定位到文件的项：地址、平台文件 ID 或内联预览内容', () => {
    expect(hasFileTarget('  ')).toBe(false)
    expect(hasFileTarget({ fileId: 'file_abc' })).toBe(true)
    expect(hasFileTarget({ id: 'not-a-file-id' })).toBe(false)
    expect(hasFileTarget({ previewContent: '  ' })).toBe(false)
    expect(hasFileTarget({ previewContent: '# 标题' })).toBe(true)

    expect(
      parseOutputFiles([
        'https://cdn.example.com/a.png',
        { downloadUrl: '/files/b.pdf', name: 'b.pdf' },
        { name: '只有名字' },
      ])
    ).toEqual([
      { url: 'https://cdn.example.com/a.png' },
      expect.objectContaining({ url: '/files/b.pdf', downloadUrl: '/files/b.pdf', name: 'b.pdf' }),
    ])
  })

  it('文件引用只认约定格式，重复的文件只留一份', () => {
    const [file] = parseOutputFiles([{ fileId: 'file_a', fileRef: 'output_file_2' }])
    expect(file.fileRef).toBe('output_file_2')
    expect(parseOutputFiles([{ fileId: 'file_a', fileRef: 'whatever' }])[0].fileRef).toBe('')
    expect(
      dedupeOutputFiles(parseOutputFiles([{ fileId: 'file_a' }, { fileId: 'file_a' }]))
    ).toHaveLength(1)
  })
})

describe('文件名与类型', () => {
  it('显示名：写明的名称 → 路径末段 → 地址末段（解码、去掉查询串）', () => {
    expect(outputFileName('https://a.com/files/%E6%8A%A5%E5%91%8A.pdf?x=1')).toBe('报告.pdf')
    expect(outputFileName({ path: 'a/b/c.png' })).toBe('c.png')
    expect(outputFileName({ url: 'https://x.com/y/z.mp4#t' })).toBe('z.mp4')
    expect(outputFileName({ title: '季度报告', url: 'https://x.com/y/z.pdf' })).toBe('季度报告')
  })

  it('平台文件接口地址的末段不是文件名', () => {
    expect(outputFileName({ url: '/api/files/file_abc/download' })).toBe('')
    expect(outputFileName(`${window.location.origin}/api/files/file_abc/preview`)).toBe('')
  })

  it('扩展名按名称、地址、类型依次推断；SVG 与 PSD 不当图片', () => {
    expect(outputFileExtension({ name: 'Report.PDF' })).toBe('pdf')
    expect(outputFileExtension({ url: 'https://x.com/a/b.webm?t=1' })).toBe('webm')
    expect(outputFileExtension({ mime: 'application/vnd.ms-excel' })).toBe('xlsx')
    expect(isImageOutputFile({ mime: 'image/png' })).toBe(true)
    expect(isImageOutputFile({ name: 'logo.svg' })).toBe(false)
    expect(isImageOutputFile({ name: 'design.psd' })).toBe(false)
    expect(isVideoOutputFile({ name: 'clip.mov' })).toBe(true)
    expect(isVideoOutputFile({ type: 'video' })).toBe(true)
  })
})

describe('工具产物转文件项', () => {
  it('按 MIME 归类，标为私有；没有合法文件 ID 的不生成', () => {
    expect(
      assetToOutputFile({ fileId: 'file_a1', mimeType: 'image/png', displayName: 'a.png', size: 3 })
    ).toEqual({
      type: 'image',
      id: 'file_a1',
      fileId: 'file_a1',
      title: 'a.png',
      role: undefined,
      mime: 'image/png',
      mimeType: 'image/png',
      size: 3,
      visibility: 'private',
      privateDownloadHidden: true,
      privatePreviewHidden: true,
    })
    expect(assetToOutputFile({ id: 'file_b', mime: 'application/pdf' })?.type).toBe('document')
    expect(assetToOutputFile({ id: 'file_c', mime: 'application/zip' })?.type).toBe('file')
    expect(assetToOutputFile({ mime: 'image/png', name: 'no-id.png' })).toBeNull()
  })
})
