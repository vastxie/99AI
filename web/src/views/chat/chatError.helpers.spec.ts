import { describe, expect, it } from 'vitest'
import {
  ChatAgentErrorCode,
  classifyChatError,
  extractAgentErrorCode,
  extractHttpStatus,
} from './chatError.helpers'

describe('extract*', () => {
  it('字符串码归一为大写，并能从各层级取出', () => {
    expect(extractAgentErrorCode({ code: 'unauthorized' })).toBe('UNAUTHORIZED')
    expect(extractAgentErrorCode({ data: { code: 'BAD_REQUEST' } })).toBe('BAD_REQUEST')
    expect(extractAgentErrorCode({ event: { data: { code: 'AI_ERROR' } } })).toBe('AI_ERROR')
    expect(extractAgentErrorCode({ response: { data: { code: 'RATE_LIMIT' } } })).toBe('RATE_LIMIT')
    expect(extractAgentErrorCode({})).toBe('')
  })

  it('only accepts HTTP-range numeric status codes', () => {
    expect(extractHttpStatus({ code: 402 })).toBe(402)
    expect(extractHttpStatus({ code: 107001 })).toBe(0)
    expect(extractHttpStatus({ code: 'UNAUTHORIZED' })).toBe(0)
  })
})

describe('classifyChatError - 后端真实字符串码', () => {
  it('UNAUTHORIZED 是唯一语义唯一的字符串码，直接分流到登录', () => {
    expect(classifyChatError({ code: ChatAgentErrorCode.UNAUTHORIZED })).toBe('loginRequired')
    expect(classifyChatError({ data: { code: 'UNAUTHORIZED', message: '请先登录' } })).toBe(
      'loginRequired'
    )
    // agent.error 事件原样透传时也能识别
    expect(
      classifyChatError({ event: { data: { code: 'UNAUTHORIZED', message: '请先登录' } } })
    ).toBe('loginRequired')
  })

  it('内容违规有专用码：按码分流，不看文案', () => {
    expect(
      classifyChatError({
        code: ChatAgentErrorCode.CONTENT_VIOLATION,
        message: 'Your message did not pass the content check',
      })
    ).toBe('contentViolation')
    // 文案里带「违规」但码是普通的 BAD_REQUEST：不再按文案猜
    expect(
      classifyChatError({
        code: ChatAgentErrorCode.BAD_REQUEST,
        message: '您提交的信息中包含违规的内容，我们已对您的账户进行标记，请合规使用！',
      })
    ).toBe('unknown')
  })

  it('其余粗粒度 / 业务字符串码不误伤，落到 unknown 由调用方显示原文', () => {
    expect(
      classifyChatError({
        code: ChatAgentErrorCode.RATE_LIMIT,
        message: '1 小时内对话次数过多，请切换模型或稍后再试！',
      })
    ).toBe('unknown')
    expect(classifyChatError({ code: ChatAgentErrorCode.AI_ERROR, message: 'AI 回复出错' })).toBe(
      'unknown'
    )
    expect(
      classifyChatError({ code: ChatAgentErrorCode.FORBIDDEN, message: '无权操作此工作流' })
    ).toBe('unknown')
    expect(
      classifyChatError({ code: ChatAgentErrorCode.INTERNAL_ERROR, message: '服务器内部错误' })
    ).toBe('unknown')
    expect(
      classifyChatError({ code: ChatAgentErrorCode.NOT_ACCEPTED, message: '未开始处理' })
    ).toBe('unknown')
    expect(
      classifyChatError({ code: ChatAgentErrorCode.TURN_MISMATCH, message: '轮次不匹配' })
    ).toBe('unknown')
  })
})

describe('classifyChatError - HTTP 链路，不按文案猜', () => {
  it('HTTP 401 可直接判定', () => {
    expect(classifyChatError({ status: 401, message: '' })).toBe('loginRequired')
    expect(classifyChatError({ code: 401, message: '' })).toBe('loginRequired')
  })

  it('访客模式没开（服务端抛 401，对话连接上归为 UNAUTHORIZED）：拉起登录', () => {
    expect(
      classifyChatError({ code: 'UNAUTHORIZED', message: '访客模式未开启，请先登录后使用！' })
    ).toBe('loginRequired')
  })

  it('没有错误码时不按文案猜（文案会改、也会翻译）：交给调用方显示原文', () => {
    expect(classifyChatError({ message: '内容涉嫌违规' })).toBe('unknown')
    expect(classifyChatError({ message: '未登录' })).toBe('unknown')
  })
})

describe('classifyChatError - 中止与未知', () => {
  it('用户主动中止优先于其他判定', () => {
    expect(classifyChatError({ name: 'AbortError' })).toBe('aborted')
    expect(classifyChatError({ message: 'request canceled' })).toBe('aborted')
    expect(classifyChatError({ message: 'The operation was aborted' })).toBe('aborted')
    expect(classifyChatError({ message: 'BodyStream closed' })).toBe('aborted')
    // 带错误码也不影响中止判定
    expect(
      classifyChatError({ code: ChatAgentErrorCode.AI_ERROR, message: 'stream aborted' })
    ).toBe('aborted')
  })

  it('无法识别的错误返回 unknown，由调用方显示原始文案', () => {
    expect(classifyChatError({ message: '模型返回超时' })).toBe('unknown')
    expect(classifyChatError({})).toBe('unknown')
  })
})
