import { randomUUID } from 'node:crypto'
import { env } from './env'

/** 经接口准备数据：用例只对「界面上发生了什么」做断言，前置数据不走界面 */
async function api<T = unknown>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${env.baseUrl}${path}`, {
    method,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  let json: { success?: boolean; data?: T } | undefined
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  if (response.status !== 200 || json?.success !== true) {
    throw new Error(`${method} ${path} 失败（HTTP ${response.status}）：${text.slice(0, 300)}`)
  }
  return json.data as T
}

export const MOCK_MODEL_NAME = 'Journey Mock'

export function adminLogin(): Promise<string> {
  return api<string>('POST', '/api/auth/login', {
    body: { username: 'super', password: env.adminPassword },
  })
}

/** 建一个指向模拟模型的对话模型；已经有了就不重复建（本机反复运行时） */
export async function ensureMockModel(): Promise<void> {
  const token = await adminLogin()
  const existing = await api<{ rows: Array<{ modelName?: string }> }>(
    'GET',
    '/api/models/query?page=1&size=100',
    { token }
  )
  if (existing.rows.some(row => row.modelName === MOCK_MODEL_NAME)) return
  await api('POST', '/api/models/setModel', {
    token,
    body: {
      modelName: MOCK_MODEL_NAME,
      model: 'smoke-mock',
      protocol: 'openai_chat_completions',
      baseUrl: env.mockUrl,
      key: 'journey-key',
      status: true,
      deduct: 0,
      modelOrder: 1,
    },
  })
}

/** 删掉名称以某个前缀开头的模型（用例收尾：界面上的删除没走到时也不留下数据） */
export async function deleteModelsNamed(prefix: string): Promise<void> {
  const token = await adminLogin()
  const existing = await api<{ rows: Array<{ id: number; modelName?: string }> }>(
    'GET',
    '/api/models/query?page=1&size=100',
    { token }
  )
  for (const row of existing.rows) {
    if (row.modelName?.startsWith(prefix)) {
      await api('POST', '/api/models/delModel', { token, body: { id: row.id } })
    }
  }
}

/** 直接经接口改一项站点配置（准备前置状态、收尾复原，不依赖界面） */
export async function setSiteConfig(configKey: string, configVal: string): Promise<void> {
  await api('POST', '/api/config/set', {
    token: await adminLogin(),
    body: { settings: [{ configKey, configVal }] },
  })
}

export interface TestUser {
  username: string
  password: string
  nickname: string
}

/** 每条用例注册自己的用户，互不影响 */
export async function registerUser(): Promise<TestUser> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8)
  const user = {
    username: `j${suffix}`,
    password: `Journey-${suffix}`,
    nickname: `用例${suffix.slice(0, 4)}`,
  }
  await api('POST', '/api/auth/register', { body: user })
  return user
}
