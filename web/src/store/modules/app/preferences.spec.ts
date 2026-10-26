import { afterEach, describe, expect, it } from 'vitest'
import { loadAppState, normalizeLanguage, parseEnabledLanguages } from './preferences'

describe('normalizeLanguage', () => {
  it('内置语言原样返回，常见别名归一，大小写与下划线不敏感', () => {
    expect(normalizeLanguage('zh-CN')).toBe('zh-CN')
    expect(normalizeLanguage('en-US')).toBe('en-US')
    expect(normalizeLanguage(' en_us ')).toBe('en-US')
    expect(normalizeLanguage('ZH')).toBe('zh-CN')
    expect(normalizeLanguage('cn')).toBe('zh-CN')
  })

  it('无法识别的输入回到简体中文，原型链上的名字不会被当成语言', () => {
    for (const input of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
      'fr',
      '',
      null,
      42,
    ]) {
      expect(normalizeLanguage(input)).toBe('zh-CN')
    }
  })
})

describe('parseEnabledLanguages', () => {
  it('解析后台保存的 JSON 并归一去重，为空或无效时视为全部启用', () => {
    expect(parseEnabledLanguages('["en","en-US","constructor"]')).toEqual(['en-US', 'zh-CN'])
    expect(parseEnabledLanguages('not json')).toEqual(['zh-CN', 'en-US'])
    expect(parseEnabledLanguages([])).toEqual(['zh-CN', 'en-US'])
  })
})

describe('loadAppState', () => {
  afterEach(() => localStorage.clear())

  it('语言只认单独保存的 appLanguage：偏好里顺带存的 language 不参与，没有时为简体中文', () => {
    localStorage.setItem(
      'appSetting',
      JSON.stringify({ data: { siderCollapsed: true, language: 'en-US' }, expire: null })
    )
    expect(loadAppState()).toMatchObject({ language: 'zh-CN', siderCollapsed: true })
    localStorage.setItem('appLanguage', 'en')
    expect(loadAppState().language).toBe('en-US')
  })
})
