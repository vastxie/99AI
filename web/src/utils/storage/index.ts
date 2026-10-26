/**
 * 浏览器本地持久化。
 *
 * `localStore` 把值以 JSON 记录 `{ data, expire }` 写入 localStorage：expire 是毫秒时间戳，null 表示长期有效。
 * 读到已过期、无法解析或结构不对的记录时删除它并返回 null。
 * `rawStore` 按原始字符串读写，只给沿用既有格式的偏好（语言 `appLanguage`、明暗模式 `theme`）使用，
 * 改成 JSON 记录会把已保存的值当成无效记录删掉。
 * 存储可能整个不可用（隐私模式、被浏览器或策略禁用、配额不足），连取 `window.localStorage` 都会抛错：
 * 两者都是读失败当作没有，删失败忽略，写失败只告警并返回 false，都不打断调用方。
 */
interface StoredRecord<T> {
  data: T
  expire: number | null
}

function isLiveRecord(value: unknown): value is StoredRecord<unknown> {
  if (!value || typeof value !== 'object' || !('data' in value)) return false
  const { expire } = value as { expire?: unknown }
  return expire === null || (typeof expire === 'number' && expire >= Date.now())
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** 取存储对象本身也可能抛错（存储被禁用时访问 window.localStorage 即抛 SecurityError） */
function backend(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readRaw(key: string): string | null {
  try {
    return backend()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function removeRaw(key: string) {
  try {
    backend()?.removeItem(key)
  } catch {
    // 删不掉也不影响调用方：读的时候会再次判定为无效
  }
}

/** 写入原始字符串；配额不足时腾出这个键的旧值再试一次，仍失败就放回旧值，本次不保存 */
function writeRaw(key: string, raw: string): boolean {
  const storage = backend()
  if (!storage) {
    console.warn(`[localStore] 未能保存 "${key}"：本地存储不可用`)
    return false
  }
  try {
    storage.setItem(key, raw)
    return true
  } catch (error) {
    const previous = readRaw(key)
    try {
      storage.removeItem(key)
      storage.setItem(key, raw)
      return true
    } catch {
      if (previous !== null) {
        try {
          storage.setItem(key, previous)
        } catch {
          // 旧值也放不回去时保持删除状态
        }
      }
      console.warn(`[localStore] 未能保存 "${key}"`, error)
      return false
    }
  }
}

export const localStore = {
  get<T = any>(key: string): T | null {
    const raw = readRaw(key)
    if (raw === null) return null
    const record = parse(raw)
    if (isLiveRecord(record)) return record.data as T
    removeRaw(key)
    return null
  },

  /** 返回是否写入成功（存储不可用、配额不足时为 false） */
  set<T>(key: string, value: T): boolean {
    const record: StoredRecord<T> = { data: value, expire: null }
    return writeRaw(key, JSON.stringify(record))
  },

  remove(key: string) {
    removeRaw(key)
  },
}

export const rawStore = {
  get(key: string): string | null {
    return readRaw(key)
  },

  /**
   * 返回是否写入成功（存储不可用、配额不足时为 false）。写失败不删除、不重试，旧值逐字保留
   * （与 localStore 腾出旧值再试不同：偏好写不进只影响下次打开）
   */
  set(key: string, value: string): boolean {
    const storage = backend()
    if (!storage) {
      console.warn(`[rawStore] 未能保存 "${key}"：本地存储不可用`)
      return false
    }
    try {
      storage.setItem(key, value)
      return true
    } catch (error) {
      console.warn(`[rawStore] 未能保存 "${key}"`, error)
      return false
    }
  },

  remove(key: string) {
    removeRaw(key)
  },
}
