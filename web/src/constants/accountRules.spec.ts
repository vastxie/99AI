import { describe, expect, it } from 'vitest'
import { passwordProblem, passwordRuleHint, USERNAME_PATTERN } from './accountRules'

describe('账号规则（与服务端 DTO 一致）', () => {
  it('密码 6-30 位，不另加字母、数字要求', () => {
    expect(passwordProblem('12345')).toBe('密码长度需为 6-30 个字符')
    expect(passwordProblem('123456')).toBe('')
    expect(passwordProblem('a'.repeat(30))).toBe('')
    expect(passwordProblem('a'.repeat(31))).not.toBe('')
    expect(passwordRuleHint()).toBe('6-30 个字符')
  })

  it('注册用户名 2-12 位字母、数字、下划线、短横和点', () => {
    expect(USERNAME_PATTERN.test('a')).toBe(false)
    expect(USERNAME_PATTERN.test('alice.w_1-2')).toBe(true)
    expect(USERNAME_PATTERN.test('中文名')).toBe(false)
    expect(USERNAME_PATTERN.test('a'.repeat(13))).toBe(false)
  })
})
