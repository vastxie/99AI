import { isIPv4 } from 'node:net';
import { lookup } from 'node:dns/promises';

const ranges = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const number = (value) =>
  value.split('.').reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
export function publicIPv4(value) {
  if (!isIPv4(value)) return false;
  const ip = number(value);
  return !ranges.some(([base, bits]) => ip >>> (32 - bits) === number(base) >>> (32 - bits));
}
const list = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
export async function resolveTarget(
  authority,
  { tunnel = false, env = process.env, resolve = lookup } = {},
) {
  if (
    typeof authority !== 'string' ||
    authority.length > 2048 ||
    /[\s\\\x00-\x1f\x7f]/u.test(authority)
  )
    throw new Error('invalid target');
  const url = new URL(tunnel ? `https://${authority}/` : authority);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !['http:', 'https:'].includes(url.protocol) ||
    (tunnel ? authority !== `${url.hostname}:443` : url.protocol !== 'http:')
  )
    throw new Error('invalid target');
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (port !== (tunnel ? 443 : 80)) throw new Error('invalid port');
  const hostname = url.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/u.test(hostname) || hostname.endsWith('.') || hostname.length > 253)
    throw new Error('invalid hostname');
  const denied = list(env.EGRESS_DENY_HOSTS);
  const allowed = list(env.EGRESS_ALLOW_HOSTS);
  const match = (entry) => hostname === entry || (!isIPv4(entry) && hostname.endsWith(`.${entry}`));
  if (denied.some(match) || (allowed.length && !allowed.some(match)))
    throw new Error('denied hostname');
  const addresses = isIPv4(hostname)
    ? [{ address: hostname }]
    : await resolve(hostname, { family: 4, all: true });
  if (
    !addresses.length ||
    addresses.length > 32 ||
    addresses.some((item) => !publicIPv4(item.address) || denied.includes(item.address))
  )
    throw new Error('denied address');
  // 连接必须使用该已验证 IP，不能再次按域名解析。
  return {
    address: addresses[0].address,
    port,
    hostname,
    authority: url.host,
    path: `${url.pathname}${url.search}`,
  };
}
export function forwardingHeaders(headers) {
  const denied = new Set([
    'proxy-authorization',
    'proxy-authenticate',
    'connection',
    'proxy-connection',
    'keep-alive',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]);
  for (const part of String(headers.connection || '').split(','))
    denied.add(part.trim().toLowerCase());
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !denied.has(key.toLowerCase())),
  );
}
