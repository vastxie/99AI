export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** 绝对 http(s) 地址（不含协议相对 // 与其它 scheme），大小写不敏感 */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value)
}

/** URL 对象的 protocol 字段是否为 http: / https: */
export function isHttpProtocol(protocol: string): boolean {
  return /^https?:$/iu.test(protocol)
}
