import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * MCP 调用方身份透传。
 *
 * 内核在每次工具调用的 `params._meta['99agent/caller']` 里带上当前用户身份，
 * 让垂直包的 MCP 服务能按用户隔离领域数据。配置了 identitySecret 的服务器会收到 HMAC-SHA256 签名，
 * 服务端用同一密钥调用 verifyMcpCallerMeta 校验来源与时效；未配置密钥时只透传、不签名。
 */
export const MCP_CALLER_META_KEY = '99agent/caller';
export const MCP_CALLER_META_VERSION = 1;
/** 签名有效期：足够覆盖一次工具调用，过期即拒绝重放 */
export const MCP_CALLER_META_TTL_MS = 5 * 60 * 1000;

export interface McpCallerIdentity {
  kind: 'user' | 'visitor';
  /** 用户 id（数字用户）或访客 id */
  id: string;
  uid?: string;
  role?: string;
}

export interface McpCallerMeta extends McpCallerIdentity {
  v: typeof MCP_CALLER_META_VERSION;
  issuedAt: number;
  expiresAt: number;
  signature?: string;
}

/** 从工具执行上下文的 options 里读取调用方身份；读不到时返回 undefined（不透传） */
export function readMcpCallerIdentity(
  options: Record<string, any> | undefined,
): McpCallerIdentity | undefined {
  const userId = Number(options?.userId);
  if (Number.isInteger(userId) && userId > 0) {
    const identity: McpCallerIdentity = { kind: 'user', id: String(userId) };
    if (typeof options?.uid === 'string' && options.uid.trim()) identity.uid = options.uid.trim();
    const role = typeof options?.userRole === 'string' ? options.userRole : options?.role;
    if (typeof role === 'string' && role.trim()) identity.role = role.trim();
    return identity;
  }
  const visitorId = typeof options?.visitorId === 'string' ? options.visitorId.trim() : '';
  if (visitorId) return { kind: 'visitor', id: visitorId, role: 'visitor' };
  return undefined;
}

function canonical(meta: Omit<McpCallerMeta, 'signature'>): string {
  return [
    meta.v,
    meta.kind,
    meta.id,
    meta.uid ?? '',
    meta.role ?? '',
    meta.issuedAt,
    meta.expiresAt,
  ].join('|');
}

export function signMcpCallerMeta(meta: Omit<McpCallerMeta, 'signature'>, secret: string): string {
  return createHmac('sha256', secret).update(canonical(meta)).digest('hex');
}

export function buildMcpCallerMeta(
  identity: McpCallerIdentity,
  secret?: string,
  now: number = Date.now(),
): McpCallerMeta {
  const base: Omit<McpCallerMeta, 'signature'> = {
    v: MCP_CALLER_META_VERSION,
    kind: identity.kind,
    id: identity.id,
    ...(identity.uid ? { uid: identity.uid } : {}),
    ...(identity.role ? { role: identity.role } : {}),
    issuedAt: now,
    expiresAt: now + MCP_CALLER_META_TTL_MS,
  };
  const secretValue = String(secret || '').trim();
  return secretValue ? { ...base, signature: signMcpCallerMeta(base, secretValue) } : base;
}

export type McpCallerVerifyResult =
  | { ok: true; identity: McpCallerIdentity }
  | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'unsigned' | 'bad-signature' };

/** 供垂直包 / MCP 服务端复用：校验内核透传的身份（同一 secret） */
export function verifyMcpCallerMeta(
  meta: unknown,
  secret: string,
  now: number = Date.now(),
): McpCallerVerifyResult {
  if (meta === undefined || meta === null) return { ok: false, reason: 'missing' };
  if (typeof meta !== 'object') return { ok: false, reason: 'malformed' };
  const value = meta as Partial<McpCallerMeta>;
  if (
    value.v !== MCP_CALLER_META_VERSION ||
    (value.kind !== 'user' && value.kind !== 'visitor') ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.issuedAt !== 'number' ||
    typeof value.expiresAt !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (now > value.expiresAt || value.issuedAt > now + 60_000)
    return { ok: false, reason: 'expired' };
  if (typeof value.signature !== 'string' || !value.signature)
    return { ok: false, reason: 'unsigned' };
  // 上方已确认 signature 为非空字符串；断言只把该收窄带过类型转换
  const { signature, ...unsigned } = value as McpCallerMeta & { signature: string };
  const expected = signMcpCallerMeta(unsigned, secret);
  const given = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return { ok: false, reason: 'bad-signature' };
  }
  const identity: McpCallerIdentity = { kind: value.kind, id: value.id };
  if (value.uid) identity.uid = value.uid;
  if (value.role) identity.role = value.role;
  return { ok: true, identity };
}
