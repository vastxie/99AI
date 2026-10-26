import { createHmac, randomBytes } from 'node:crypto';

const PROCESS_SESSION_SECRET = randomBytes(32);
let modelGatewaySessionSecret: string | Buffer = PROCESS_SESSION_SECRET;

/**
 * 在应用启动时注入仅本机持有、可跨重启复用的服务端密钥。
 * 供应商不能同时获知此密钥与会话请求头，因此无法枚举内部作用域。
 */
export function initializeModelGatewaySessionSecret(secret: unknown): void {
  const normalizedSecret = String(secret || '').trim();
  if (Buffer.byteLength(normalizedSecret, 'utf8') < 32) {
    throw new Error('模型网关会话密钥至少 32 个字节');
  }
  modelGatewaySessionSecret = normalizedSecret;
}

/**
 * 为需要会话黏性的供应商生成不可枚举的稳定标识。
 * 正常启动时使用 Redis 中持久化的本机服务密钥；独立单元测试退化为进程内随机密钥。
 */
export function createOpaqueModelGatewaySessionId(scope: unknown): string {
  const normalizedScope = String(scope || 'request');
  return `99agent-${createHmac('sha256', modelGatewaySessionSecret)
    .update(normalizedScope)
    .digest('hex')
    .slice(0, 32)}`;
}
