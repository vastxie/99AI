import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCommerceEnabled, parseCommerceEnabled } from './index'

// 本地 .env 里默认写有 VITE_COMMERCE_ENABLED=true，每个用例都显式桩替换，
// 断言不受开发者本机 env 影响
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseCommerceEnabled（VITE_COMMERCE_ENABLED 取值解析）', () => {
  it('缺省 / 空值默认开启', () => {
    expect(parseCommerceEnabled(undefined)).toBe(true)
    expect(parseCommerceEnabled(null)).toBe(true)
    expect(parseCommerceEnabled('')).toBe(true)
    expect(parseCommerceEnabled('   ')).toBe(true)
  })

  it('仅 false / 0 / off / no 关闭，忽略大小写与首尾空白', () => {
    const disabledValues = [
      'false',
      'FALSE',
      'False',
      '0',
      'off',
      'OFF',
      'no',
      'No',
      ' false ',
      '\t0\n',
    ]
    for (const value of disabledValues) {
      expect(parseCommerceEnabled(value), `value=${JSON.stringify(value)}`).toBe(false)
    }
  })

  it('true 及其它任意取值视为开启', () => {
    const enabledValues = ['true', 'TRUE', '1', 'on', 'yes', 'enabled', 'disable', 'nope', 'falsey']
    for (const value of enabledValues) {
      expect(parseCommerceEnabled(value), `value=${JSON.stringify(value)}`).toBe(true)
    }
  })

  it('非字符串入参按字符串化后解析', () => {
    expect(parseCommerceEnabled(false)).toBe(false)
    expect(parseCommerceEnabled(0)).toBe(false)
    expect(parseCommerceEnabled(true)).toBe(true)
    expect(parseCommerceEnabled(1)).toBe(true)
  })
})

describe('isCommerceEnabled（读取 import.meta.env）', () => {
  it('未设置变量时默认开启', () => {
    vi.stubEnv('VITE_COMMERCE_ENABLED', undefined)
    expect(isCommerceEnabled()).toBe(true)
  })

  it('显式 true 开启', () => {
    vi.stubEnv('VITE_COMMERCE_ENABLED', 'true')
    expect(isCommerceEnabled()).toBe(true)
  })

  it('false / 0 / off / no 关闭', () => {
    for (const value of ['false', '0', 'off', 'no', ' OFF ']) {
      vi.stubEnv('VITE_COMMERCE_ENABLED', value)
      expect(isCommerceEnabled(), `value=${JSON.stringify(value)}`).toBe(false)
    }
  })

  it('每次调用实时读取，桩替换后立即生效', () => {
    vi.stubEnv('VITE_COMMERCE_ENABLED', 'false')
    expect(isCommerceEnabled()).toBe(false)
    vi.stubEnv('VITE_COMMERCE_ENABLED', 'true')
    expect(isCommerceEnabled()).toBe(true)
  })
})
