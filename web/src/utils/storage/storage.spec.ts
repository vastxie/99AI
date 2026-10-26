import { afterEach, describe, expect, it, vi } from 'vitest'
import { localStore, rawStore } from './index'

const realStorage = window.localStorage

/** 换掉 window.localStorage：传函数时取值即抛错（存储被禁用），传对象时用假的存储 */
function replaceStorage(next: (() => never) | Partial<Storage>) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: typeof next === 'function' ? next : () => next,
  })
}

afterEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => realStorage })
  realStorage.clear()
  vi.restoreAllMocks()
})

describe('本地存储', () => {
  it('正常读写删；过期或结构不对的记录读出为空并删除', () => {
    expect(localStore.set('k', { a: 1 })).toBe(true)
    expect(localStore.get('k')).toEqual({ a: 1 })
    localStore.remove('k')
    expect(localStore.get('k')).toBeNull()

    realStorage.setItem('old', JSON.stringify({ data: 'x', expire: 1 }))
    realStorage.setItem('bad', '{not json')
    expect(localStore.get('old')).toBeNull()
    expect(localStore.get('bad')).toBeNull()
    expect(realStorage.getItem('old')).toBeNull()
    expect(realStorage.getItem('bad')).toBeNull()
  })

  it('存储被禁用（取 window.localStorage 即抛错）：读为空、写返回 false、删不抛', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    replaceStorage(() => {
      throw new Error('SecurityError')
    })
    expect(localStore.get('k')).toBeNull()
    expect(localStore.set('k', 'v')).toBe(false)
    expect(() => localStore.remove('k')).not.toThrow()
  })

  it('读写删都抛错（含写失败后读旧值也失败）：写返回 false，都不抛', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fail = () => {
      throw new Error('denied')
    }
    replaceStorage({ getItem: fail, setItem: fail, removeItem: fail })
    expect(localStore.get('k')).toBeNull()
    expect(localStore.set('k', 'v')).toBe(false)
    expect(() => localStore.remove('k')).not.toThrow()
  })

  it('配额不足：腾出这个键的旧值后写入成功返回 true；仍失败则放回旧值、返回 false', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const data = new Map<string, string>([['k', 'old']])
    let failures = 1
    replaceStorage({
      getItem: key => data.get(key) ?? null,
      removeItem: key => void data.delete(key),
      setItem: (key, value) => {
        if (failures-- > 0) throw new Error('QuotaExceededError')
        data.set(key, value)
      },
    })
    expect(localStore.set('k', 'new')).toBe(true)
    expect(JSON.parse(data.get('k')!)).toEqual({ data: 'new', expire: null })

    data.set('k', 'old')
    failures = 2
    expect(localStore.set('k', 'newer')).toBe(false)
    expect(data.get('k')).toBe('old')
  })
})

describe('原始字符串偏好（rawStore）', () => {
  it('按原始字符串读写删：读得到既有的原值，写回的也是原文（不包 JSON）', () => {
    realStorage.setItem('appLanguage', 'en-US')
    expect(rawStore.get('appLanguage')).toBe('en-US')
    expect(rawStore.set('theme', 'dark')).toBe(true)
    expect(realStorage.getItem('theme')).toBe('dark')
    rawStore.remove('theme')
    expect(realStorage.getItem('theme')).toBeNull()
  })

  it('存储被禁用：读为空、写返回 false、删不抛', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    replaceStorage(() => {
      throw new Error('SecurityError')
    })
    expect(rawStore.get('appLanguage')).toBeNull()
    expect(rawStore.set('appLanguage', 'en-US')).toBe(false)
    expect(() => rawStore.remove('appLanguage')).not.toThrow()
  })

  it('写失败不删除旧值：旧值逐字保留', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const data = new Map<string, string>([['appLanguage', 'en-US']])
    replaceStorage({
      getItem: key => data.get(key) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: key => void data.delete(key),
    })
    expect(rawStore.set('appLanguage', 'zh-CN')).toBe(false)
    expect(data.get('appLanguage')).toBe('en-US')
  })
})
