import { describe, expect, it } from 'vitest'
import { isHttpProtocol, isHttpUrl } from './index'

describe('URL scheme 判定单源', () => {
  it('isHttpUrl 只接受带 // 的绝对 http(s) 地址，大小写不敏感', () => {
    for (const url of [
      'http://example.com',
      'HTTPS://example.com/a?b=1#c',
      'https://localhost:9002/api/files/file_a/preview',
    ]) {
      expect(isHttpUrl(url), url).toBe(true)
    }
    for (const url of [
      '//example.com',
      'https:example.com',
      'ftp://example.com',
      ' http://example.com',
      'javascript:alert(1)',
      '/api/files/file_a/preview',
      '',
    ]) {
      expect(isHttpUrl(url), url).toBe(false)
    }
  })

  it('isHttpProtocol 匹配 URL.protocol 形式的 http: / https:', () => {
    for (const protocol of ['http:', 'https:', 'HTTP:']) {
      expect(isHttpProtocol(protocol), protocol).toBe(true)
    }
    for (const protocol of ['http://', 'ftp:', 'https:x', 'javascript:', 'blob:', '']) {
      expect(isHttpProtocol(protocol), protocol).toBe(false)
    }
    expect(isHttpProtocol(new URL('https://example.com/a').protocol)).toBe(true)
    expect(isHttpProtocol(new URL('blob:http://localhost:9002/id').protocol)).toBe(false)
  })
})
