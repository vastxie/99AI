import { describe, expect, it, vi } from 'vitest'
import { classifyAttachment, rejectAttachment } from './attachmentRules'

vi.mock('@/locales', () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    `${key}${params ? JSON.stringify(params) : ''}`,
}))

const file = (name: string, type: string, size = 10) =>
  Object.defineProperty(new File(['x'], name, { type }), 'size', { value: size })

describe('附件规则', () => {
  it('按 MIME 或扩展名分成图片、视频、音频与文档', () => {
    expect(classifyAttachment(file('a.png', 'image/png'))).toBe('image')
    expect(classifyAttachment(file('a.MOV', ''))).toBe('video')
    expect(classifyAttachment(file('a.mp3', 'audio/mpeg'))).toBe('audio')
    expect(classifyAttachment(file('a.pdf', 'application/pdf'))).toBe('file')
  })

  it('不支持的类型、超出大小给出对应的原因；合规的返回 null', () => {
    expect(rejectAttachment(file('a.png', 'image/png'), 'image', 20)).toBeNull()
    expect(rejectAttachment(file('a.svg', 'image/svg+xml'), 'image', 20)).toContain(
      'chat.unsupportedImageType'
    )
    expect(rejectAttachment(file('a.exe', 'application/x-msdownload'), 'file', 20)).toContain(
      'chat.unsupportedFileType'
    )
    expect(rejectAttachment(file('a.mp4', 'video/mp4', 30 * 1024 * 1024), 'video', 20)).toContain(
      'chat.videoSizeExceeded'
    )
    expect(rejectAttachment(file('a.md', ''), 'file', 20)).toBeNull()
  })

  it('压缩包按文档类接收，交给沙箱解压处理', () => {
    expect(classifyAttachment(file('商品图.zip', 'application/zip'))).toBe('file')
    expect(rejectAttachment(file('商品图.zip', 'application/zip'), 'file', 20)).toBeNull()
    expect(
      rejectAttachment(file('素材.zip', 'application/x-zip-compressed'), 'file', 20)
    ).toBeNull()
    expect(rejectAttachment(file('素材.zip', ''), 'file', 20)).toBeNull()
  })
})
