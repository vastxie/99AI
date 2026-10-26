import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'

describe('sha256Hex', () => {
  it('matches the standard test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    )
  })

  it('agrees with Node crypto across block boundaries and non-ASCII text', () => {
    // 55 / 56 / 63 / 64 / 65 字节附近决定补位落在一块还是两块
    for (const size of [1, 43, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const text = 'x'.repeat(size)
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
    }
    const unicode = '第三方登录 🔐 café'
    expect(sha256Hex(unicode)).toBe(createHash('sha256').update(unicode, 'utf8').digest('hex'))
  })
})
