/** 用例运行所需的环境：都由启动环境的一方提供，用例自己不启动服务 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

export const env = {
  /** server 地址（同时提供构建后的用户端与管理端） */
  get baseUrl() {
    return required('E2E_BASE_URL').replace(/\/$/, '')
  },
  /** 模拟模型地址（scripts/smoke/mock-openai.mjs） */
  get mockUrl() {
    return required('E2E_MOCK_URL').replace(/\/$/, '')
  },
  /** 超管 super 的初始密码，与 server 的 ADMIN_INITIAL_PASSWORD 相同 */
  get adminPassword() {
    return required('ADMIN_INITIAL_PASSWORD')
  },
}
