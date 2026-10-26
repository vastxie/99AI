import { describe, expect, it } from 'vitest'
import { parseChatMessage, parseStoredTurnId } from './messageParser'

describe('parseChatMessage', () => {
  it('解析 JSON 字符串为对象（正例）', () => {
    const result = parseChatMessage('{"text":"hello","rounds":[]}')
    expect(result).toEqual({ text: 'hello', rounds: [] })
  })

  it('拒绝二次编码的 JSON 字符串', () => {
    const doubleEncoded = JSON.stringify(JSON.stringify({ turn: { id: 'turn_1' } }))
    expect(parseChatMessage(doubleEncoded)).toBeNull()
  })

  it('已解析对象原样返回（正例）', () => {
    const message = { text: 'hi' }
    expect(parseChatMessage(message)).toBe(message)
  })

  it('非法 JSON 返回 null 而不是抛错（反例）', () => {
    expect(parseChatMessage('{not-json')).toBeNull()
    expect(parseChatMessage('plain text')).toBeNull()
  })

  it('空值与非对象结果返回 null（反例）', () => {
    expect(parseChatMessage(null)).toBeNull()
    expect(parseChatMessage(undefined)).toBeNull()
    expect(parseChatMessage('')).toBeNull()
    // JSON 合法但不是对象：数组 / 数字 / 字符串
    expect(parseChatMessage('[1,2]')).toBeNull()
    expect(parseChatMessage('42')).toBeNull()
    expect(parseChatMessage(JSON.stringify('just a string'))).toBeNull()
  })
})

describe('parseStoredTurnId', () => {
  it('从存量消息中提取并修剪 turn id（正例）', () => {
    expect(parseStoredTurnId(JSON.stringify({ turn: { id: ' turn_42 ' } }))).toBe('turn_42')
  })

  it('缺失或非法时返回空串（反例）', () => {
    expect(parseStoredTurnId(null)).toBe('')
    expect(parseStoredTurnId(undefined)).toBe('')
    expect(parseStoredTurnId('{broken')).toBe('')
    expect(parseStoredTurnId(JSON.stringify({ text: 'no turn' }))).toBe('')
  })
})
