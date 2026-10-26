import { Request } from 'express';
import { BlockList, isIP } from 'net';

type IpSource = Pick<Request, 'headers' | 'header' | 'connection' | 'socket'> & {
  ip?: string;
};

/** 统一地址写法：去掉方括号与 IPv4 映射前缀（不区分大小写），IPv6 转小写；非法地址返回空串 */
function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '';
  let normalized = String(ip).trim();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(normalized);
  if (mapped) normalized = mapped[1];
  const family = isIP(normalized);
  if (!family) return '';
  return family === 6 ? normalized.toLowerCase() : normalized;
}

function getHeader(req: IpSource, name: string): string {
  const headerFn = typeof req.header === 'function' ? req.header.bind(req) : null;
  const value = headerFn?.(name) || (req.headers as any)?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value || '';
}

let trustedProxyCache: { configured: string; list: BlockList } | undefined;

/** 可信代理：本机回环加 TRUSTED_PROXY_CIDRS（逗号分隔，IPv4 / IPv6 地址或网段）；写错的项忽略 */
function getTrustedProxies(): BlockList {
  const configured = process.env.TRUSTED_PROXY_CIDRS || '';
  if (trustedProxyCache?.configured === configured) return trustedProxyCache.list;
  const list = new BlockList();
  list.addAddress('127.0.0.1', 'ipv4');
  list.addAddress('::1', 'ipv6');
  for (const rule of configured.split(',')) {
    const [address, prefixRaw] = rule.trim().split('/');
    const ip = normalizeIp(address);
    if (!ip) continue;
    const family = isIP(ip) === 6 ? 'ipv6' : 'ipv4';
    if (prefixRaw === undefined) {
      list.addAddress(ip, family);
      continue;
    }
    const prefix = Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 'ipv6' ? 128 : 32)) {
      continue;
    }
    list.addSubnet(ip, prefix, family);
  }
  trustedProxyCache = { configured, list };
  return list;
}

function isTrustedProxy(remoteIp: string): boolean {
  const ip = normalizeIp(remoteIp);
  if (!ip) return false;
  if (process.env.TRUST_PROXY === 'true') return true;
  return getTrustedProxies().check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

/**
 * 从直连对端开始沿 X-Forwarded-For 往左走：当前这一跳是可信代理，才相信它追加的左边一项；
 * 第一个不可信的地址就是客户端。左侧各项是客户端自己能写的，例如 nginx 的
 * $proxy_add_x_forwarded_for 收到伪造值时得到「伪造, 真实」，取最左会让任何人自选 IP。
 * 遇到无法解析的一项停在它右边那一跳；整条链都可信（含 TRUST_PROXY=true）时取最左一项。
 */
function resolveForwardedClient(remoteIp: string, forwardedFor: string): string {
  const hops = forwardedFor.split(',');
  let client = remoteIp;
  for (let index = hops.length - 1; index >= 0 && isTrustedProxy(client); index -= 1) {
    const hop = normalizeIp(hops[index]);
    if (!hop) break;
    client = hop;
  }
  return client;
}

export function getClientIp(req: IpSource): string {
  // 信任链从套接字对端开始：req.ip 在开启 Express trust proxy 时可能已经取自请求头
  const remoteIp = normalizeIp(
    req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '',
  );
  if (!remoteIp || !isTrustedProxy(remoteIp)) return remoteIp;

  const forwardedFor = getHeader(req, 'x-forwarded-for');
  if (forwardedFor) return resolveForwardedClient(remoteIp, forwardedFor);

  // 只设置 X-Real-IP 的代理：由直连的可信代理写入
  return normalizeIp(getHeader(req, 'x-real-ip')) || remoteIp;
}

export function getClientIpFromHeaders(headers: Record<string, any>, remoteAddress = ''): string {
  return getClientIp({
    headers,
    connection: { remoteAddress },
    socket: { remoteAddress },
  } as IpSource);
}
