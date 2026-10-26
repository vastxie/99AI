import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 仅鉴权头函数会触碰 auth store / 游客会话，被测的 URL 过滤纯函数不依赖它们；
// 最小 stub 避免把 pinia store 模块链拉进测试
vi.mock('@/store/modules/auth', () => ({
  useAuthStore: () => ({ token: '' }),
}))
vi.mock('@/services/visitorSession', () => ({}))

import {
  extractInternalFileAssetIdFromUrl,
  getControlledFilePreviewUrl,
  getPrivateFileDownloadUrl,
  isInternalFileDownloadUrl,
  isPrivateOutputFile,
  normalizeFileAssetId,
  resolveAuthenticatedFileUrl,
} from './privateFileAccess'

// happy-dom 测试源固定为 http://localhost:9002（见 vitest.config.mts）；
// 置空 VITE_GLOB_API_URL 让 API 源回落同源，断言不受本地 .env 影响
beforeEach(() => {
  vi.stubEnv('VITE_GLOB_API_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getControlledFilePreviewUrl（MediaOutput 预览直链协议过滤）', () => {
  it('放行站内私有文件 preview / download 路径（正例）', () => {
    expect(getControlledFilePreviewUrl({ previewUrl: '/api/files/file_abc123/preview' })).toBe(
      '/api/files/file_abc123/preview'
    )
    expect(
      getControlledFilePreviewUrl({ url: 'http://localhost:9002/api/files/file_abc123/download' })
    ).toBe('http://localhost:9002/api/files/file_abc123/download')
  })

  it('放行同源非 /api/files/ 的普通资源地址（正例）', () => {
    expect(getControlledFilePreviewUrl({ url: '/uploads/pic.png' })).toBe('/uploads/pic.png')
    expect(getControlledFilePreviewUrl({ url: 'http://localhost:9002/uploads/pic.png' })).toBe(
      'http://localhost:9002/uploads/pic.png'
    )
  })

  it('拦截非 http/https 协议（反例：javascript / data / blob）', () => {
    expect(getControlledFilePreviewUrl({ url: 'javascript:alert(1)' })).toBe('')
    expect(getControlledFilePreviewUrl({ url: 'data:text/html,<script>alert(1)</script>' })).toBe(
      ''
    )
    expect(getControlledFilePreviewUrl({ url: 'vbscript:msgbox(1)' })).toBe('')
    expect(getControlledFilePreviewUrl({ url: 'blob:http://localhost:9002/some-id' })).toBe('')
  })

  it('拦截跨源地址（反例）', () => {
    expect(getControlledFilePreviewUrl({ url: 'https://evil.example.com/pic.png' })).toBe('')
    expect(
      getControlledFilePreviewUrl({ url: 'https://evil.example.com/api/files/file_a/preview' })
    ).toBe('')
    // 同主机不同端口同样视为跨源
    expect(getControlledFilePreviewUrl({ url: 'http://localhost:1234/uploads/pic.png' })).toBe('')
  })

  it('拦截 /api/files/ 下不合法的子路径（反例）', () => {
    expect(getControlledFilePreviewUrl({ url: '/api/files/file_abc/raw' })).toBe('')
    expect(getControlledFilePreviewUrl({ url: '/api/files/notafile/preview' })).toBe('')
  })

  it('空入参返回空串（边界）', () => {
    expect(getControlledFilePreviewUrl({})).toBe('')
  })
})

describe('isInternalFileDownloadUrl / normalizeFileAssetId / extractInternalFileAssetIdFromUrl', () => {
  it('识别站内私有文件下载地址（正例）', () => {
    expect(isInternalFileDownloadUrl('/api/files/file_abc-123/download')).toBe(true)
    expect(isInternalFileDownloadUrl('http://localhost:9002/api/files/file_abc/download')).toBe(
      true
    )
  })

  it('拒绝跨源与非下载路径（反例）', () => {
    expect(isInternalFileDownloadUrl('https://evil.example.com/api/files/file_abc/download')).toBe(
      false
    )
    expect(isInternalFileDownloadUrl('/api/files/file_abc/preview')).toBe(false)
    expect(isInternalFileDownloadUrl('/api/files/whatever/download')).toBe(false)
    expect(isInternalFileDownloadUrl('')).toBe(false)
  })

  it('规范化文件资产 id（正反例）', () => {
    expect(normalizeFileAssetId('file_abc-123')).toBe('file_abc-123')
    expect(normalizeFileAssetId(' file_abc ')).toBe('file_abc')
    expect(normalizeFileAssetId('file_')).toBe('')
    expect(normalizeFileAssetId('FILE_abc')).toBe('')
    expect(normalizeFileAssetId('../etc/passwd')).toBe('')
    expect(normalizeFileAssetId(undefined)).toBe('')
  })

  it('从 URL 提取文件资产 id（正反例）', () => {
    expect(extractInternalFileAssetIdFromUrl('/api/files/file_x9/preview')).toBe('file_x9')
    expect(extractInternalFileAssetIdFromUrl('/api/files/file_x9/download')).toBe('file_x9')
    expect(
      extractInternalFileAssetIdFromUrl('https://evil.example.com/api/files/file_x9/preview')
    ).toBe('')
    expect(extractInternalFileAssetIdFromUrl('/api/files/file_x9/delete')).toBe('')
  })
})

describe('resolveAuthenticatedFileUrl', () => {
  it('同源相对地址按 API 基址解析（正例）', () => {
    expect(resolveAuthenticatedFileUrl('/api/files/file_1/download')).toBe(
      '/api/files/file_1/download'
    )

    vi.stubEnv('VITE_GLOB_API_URL', 'http://localhost:9520/api')
    expect(resolveAuthenticatedFileUrl('/api/files/file_1/download')).toBe(
      'http://localhost:9520/api/files/file_1/download'
    )
  })

  it('非可信目标直接抛错（反例）', () => {
    expect(() =>
      resolveAuthenticatedFileUrl('https://evil.example.com/api/files/file_1/download')
    ).toThrow('Invalid file download target')
  })
})

describe('isPrivateOutputFile / getPrivateFileDownloadUrl', () => {
  it('识别私有 / 临时可见性与站内文件（正例）', () => {
    expect(isPrivateOutputFile({ visibility: 'private' })).toBe(true)
    expect(isPrivateOutputFile({ visibility: 'temporary' })).toBe(true)
    expect(isPrivateOutputFile({ fileId: 'file_x1' })).toBe(true)
    expect(
      isPrivateOutputFile({ visibility: 'public', downloadUrl: '/api/files/file_9/download' })
    ).toBe(true)
  })

  it('公开外链不按私有处理（反例）', () => {
    expect(isPrivateOutputFile({ url: 'https://cdn.example.com/a.png' })).toBe(false)
    expect(
      isPrivateOutputFile({ visibility: 'public', url: 'https://cdn.example.com/a.png' })
    ).toBe(false)
  })

  it('仅为可信文件构造下载地址（正反例）', () => {
    expect(getPrivateFileDownloadUrl({ fileId: 'file_abc' })).toBe('/api/files/file_abc/download')
    expect(
      getPrivateFileDownloadUrl({
        downloadUrl: 'https://evil.example.com/api/files/file_abc/download',
      })
    ).toBe('')
    expect(getPrivateFileDownloadUrl({})).toBe('')
  })
})
