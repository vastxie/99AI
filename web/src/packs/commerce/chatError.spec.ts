import { describe, expect, it } from 'vitest'
import { classifyChatError } from '@/views/chat/chatError.helpers'
import { classifyCommerceError } from './chatError'

describe('commerce chat error classification', () => {
  it('额度 / 积分不足按 HTTP 402 或对话连接上的 PAYMENT_REQUIRED 识别，不看文案', () => {
    expect(classifyCommerceError({ status: 402, message: '' })).toBe('balanceInsufficient')
    expect(classifyCommerceError({ code: 402, message: '' })).toBe('balanceInsufficient')
    expect(
      classifyCommerceError({
        code: 'PAYMENT_REQUIRED',
        message: '积分不足，继续体验服务，请按需选购套餐！',
      })
    ).toBe('balanceInsufficient')
    // 没有码、只有文案：不再猜
    expect(classifyCommerceError({ message: '积分不足，继续体验服务，请按需选购套餐！' })).toBe(
      undefined
    )
  })

  it('leaves everything else to the kernel', () => {
    expect(classifyCommerceError({ code: 'CONTENT_VIOLATION', message: '' })).toBeUndefined()
    expect(classifyCommerceError({ status: 401, message: '' })).toBeUndefined()
    expect(classifyCommerceError({})).toBeUndefined()
  })

  it('is consulted by the kernel classifier before its own rules', () => {
    expect(classifyChatError({ code: 'PAYMENT_REQUIRED', message: '' })).toBe('balanceInsufficient')
    expect(classifyChatError({ code: 'CONTENT_VIOLATION', message: '' })).toBe('contentViolation')
  })
})
