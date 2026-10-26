import { Logger } from '@nestjs/common';
import { lookup as dnsLookup, LookupAddress, LookupAllOptions } from 'dns';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP, Socket } from 'net';
import * as StrictPublicDns from './strict-public-dns.util';

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | LookupAddress[],
  family?: number,
) => void;
type LookupFunction = (
  hostname: string,
  options: Record<string, any> | LookupCallback,
  callback?: LookupCallback,
) => void;

export interface SafeDownloadOptions {
  blockPrivateNetwork?: boolean;
  /**
   * Non-bypassable public-network mode for request-scoped tools.
   *
   * When enabled, the global/admin bypass, development loopback exception,
   * reserved proxy ranges, custom DNS lookup, credentials and non-standard
   * ports are all ignored or rejected. Every redirect must remain on one of
   * the exact hosts in `allowedHosts`.
   */
  strictPublicNetwork?: boolean;
  allowedHosts?: string[];
  headers?: Record<string, string>;
  maxBytes?: number;
  maxRedirects?: number;
  reservedProxyHosts?: string[];
  timeoutMs?: number;
  lookup?: LookupFunction;
}

export interface SafeDownloadResult {
  buffer: Buffer;
  contentType: string;
  finalUrl: string;
  headers: IncomingHttpHeaders;
  statusCode: number;
}

interface RequestOnceResult {
  response: IncomingMessage;
  close: (abort: boolean) => Promise<void>;
}

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const STRICT_MAX_BYTES = 16 * 1024 * 1024;
const STRICT_MAX_REDIRECTS = 5;
const STRICT_MAX_TIMEOUT_MS = 30_000;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_REDIRECT_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
  'x-goog-api-key',
]);
const DEFAULT_RESERVED_PROXY_HOSTS = [
  // Local proxy / DNS environments may resolve public object-storage hosts to
  // 198.18/15 benchmark addresses. Keep this exception narrow: it only applies
  // to benchmark-reserved DNS results, not to direct private/loopback URLs.
  '.myqcloud.com',
  '.aliyuncs.com',
  '.amazonaws.com',
];
const GLOBAL_UNICAST_IPV6 = new BlockList();
GLOBAL_UNICAST_IPV6.addSubnet('2000::', 3, 'ipv6');
const BLOCKED_IPV6 = new BlockList();
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_IPV6.addSubnet(network, prefix, 'ipv6');
}

export async function safeDownloadToBuffer(
  rawUrl: string,
  options: SafeDownloadOptions = {},
): Promise<SafeDownloadResult> {
  assertStrictPublicNetworkOptions(options);
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const strictDeadline = options.strictPublicNetwork
    ? Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    : undefined;
  let currentUrl = parseAndValidateUrl(rawUrl, options);
  let currentHeaders = { ...(options.headers || {}) };

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let requestOptions = { ...options, headers: currentHeaders };
    if (strictDeadline != null) {
      const remainingMs = strictDeadline - Date.now();
      if (remainingMs <= 0) throw new Error('远程资源请求超时');
      requestOptions = { ...options, headers: currentHeaders, timeoutMs: remainingMs };
    }
    const requestResult = await requestOnce(currentUrl, requestOptions);
    const response = requestResult.response;
    // http.ClientRequest 的响应一定带 statusCode（IncomingMessage 类型上可选是因为它也表示服务端收到的请求）
    const statusCode = response.statusCode!;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const contentLength = Number(getHeaderValue(response.headers['content-length']) || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await requestResult.close(true);
      throw new Error('远程资源过大');
    }
    const location = getHeaderValue(response.headers.location);

    if (REDIRECT_STATUS.has(statusCode) && location) {
      let nextUrl: URL;
      try {
        const redirectUrl = new URL(location, currentUrl).toString();
        nextUrl = options.strictPublicNetwork
          ? validateStrictPublicRedirectUrl(
              currentUrl.toString(),
              redirectUrl,
              options.allowedHosts || [],
            )
          : parseAndValidateUrl(redirectUrl, options);
      } catch (error) {
        await requestResult.close(true);
        throw error;
      }
      await requestResult.close(true);
      if (currentUrl.origin !== nextUrl.origin) {
        currentHeaders = stripSensitiveRedirectHeaders(currentHeaders);
      }
      currentUrl = nextUrl;
      continue;
    }

    if (REDIRECT_STATUS.has(statusCode)) {
      await requestResult.close(true);
      throw new Error('远程资源重定向缺少 Location');
    }

    if (statusCode < 200 || statusCode >= 300) {
      await requestResult.close(true);
      throw new Error(`远程资源返回错误: HTTP ${statusCode}`);
    }

    try {
      const buffer = await readResponseBody(response, { maxBytes });
      await requestResult.close(false);
      return {
        buffer,
        contentType: getHeaderValue(response.headers['content-type']) || 'application/octet-stream',
        finalUrl: currentUrl.toString(),
        headers: response.headers,
        statusCode,
      };
    } catch (error) {
      await requestResult.close(true);
      throw error;
    }
  }

  throw new Error('远程资源重定向次数过多');
}

export function validateStrictPublicHttpUrl(rawUrl: string, allowedHosts: string[]): URL {
  const options: SafeDownloadOptions = { strictPublicNetwork: true, allowedHosts };
  assertStrictPublicNetworkOptions(options);
  return parseAndValidateUrl(rawUrl, options);
}

export function validateStrictPublicRedirectUrl(
  currentUrl: string,
  redirectUrl: string,
  allowedHosts: string[],
): URL {
  const current = validateStrictPublicHttpUrl(currentUrl, allowedHosts);
  const redirect = validateStrictPublicHttpUrl(redirectUrl, allowedHosts);
  if (current.protocol === 'https:' && redirect.protocol !== 'https:') {
    throw new Error('严格公网下载不允许 HTTPS 降级重定向');
  }
  return redirect;
}

/** 云平台实例元数据服务：即使管理员配置的出站地址（模型网关、MCP）也一律禁止 */
const CLOUD_METADATA_HOSTS = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'fd00:ec2::254',
  'metadata.google.internal',
  'metadata',
]);

export function isCloudMetadataHost(hostname: string): boolean {
  const normalized = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!normalized) return false;
  if (CLOUD_METADATA_HOSTS.has(normalized)) return true;
  return normalized.startsWith('169.254.');
}

export function isBlockedNetworkAddress(address: string): boolean {
  const normalized = normalizeIpAddress(address);
  if (!normalized) return true;
  if (isIPv4(normalized)) return isBlockedIPv4(normalized);
  if (isIP(normalized) === 6) return isBlockedIPv6(normalized);
  return true;
}

export function isBlockedResolvedNetworkAddress(
  address: string,
  hostname?: string,
  reservedProxyHosts: string[] = [],
): boolean {
  const normalized = normalizeIpAddress(address);
  if (isIPv4(normalized) && isBenchmarkReservedIPv4(normalized)) {
    return !isReservedProxyResolutionAllowed(hostname, reservedProxyHosts);
  }
  return isBlockedNetworkAddress(address);
}

function parseAndValidateUrl(rawUrl: string, options: SafeDownloadOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('无效的 URL 格式');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`不支持的协议: ${parsed.protocol}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('远程资源 URL 不允许包含认证信息');
  }

  if (!parsed.hostname) {
    throw new Error('远程资源 URL 缺少主机名');
  }

  const hostname = stripIpv6Brackets(parsed.hostname);
  if (options.strictPublicNetwork) {
    const allowedHosts = normalizeStrictAllowedHosts(options.allowedHosts);
    const normalizedHostname = normalizeHostname(hostname);
    if (isIP(normalizedHostname) || !allowedHosts.includes(normalizedHostname)) {
      Logger.warn(`严格公网下载拒绝未授权主机: ${normalizedHostname}`, 'SafeDownload');
      throw new Error('严格公网下载仅允许请求指定的公开主机');
    }
    if (parsed.port) {
      throw new Error('严格公网下载不允许非标准端口');
    }
  }
  if (shouldBlockPrivateNetwork(options) && isIP(hostname) && isBlockedNetworkAddress(hostname)) {
    Logger.warn(`远程资源下载拒绝访问受限地址: ${hostname}`, 'SafeDownload');
    throw new Error('不允许访问内网或保留地址');
  }

  return parsed;
}

function requestOnce(url: URL, options: SafeDownloadOptions): Promise<RequestOnceResult> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // 拦截内网时，调用方自带的 DNS 解析也只提供候选地址，结果照样逐个校验
    const lookup = options.strictPublicNetwork
      ? createSafeLookup([], true)
      : shouldBlockPrivateNetwork(options)
        ? createSafeLookup(options.reservedProxyHosts, false, options.lookup)
        : options.lookup;
    const strictAgent = options.strictPublicNetwork
      ? createStrictDirectAgent(url, lookup as LookupFunction)
      : undefined;
    let request: http.ClientRequest;
    let response: IncomingMessage | undefined;
    let socket: Socket | undefined;
    let connectionClosed = false;
    let resolveConnectionClosed!: () => void;
    const connectionClosedPromise = new Promise<void>(resolveClosed => {
      resolveConnectionClosed = resolveClosed;
    });
    const markConnectionClosed = () => {
      if (connectionClosed) return;
      connectionClosed = true;
      resolveConnectionClosed();
    };

    try {
      request = transport.request(
        url,
        {
          method: 'GET',
          headers: options.headers,
          timeout: timeoutMs,
          agent: strictAgent,
          lookup,
        },
        incoming => {
          response = incoming;
          let closePromise: Promise<void> | undefined;
          resolve({
            response: incoming,
            close: abort => {
              if (!closePromise) {
                closePromise = (async () => {
                  if (abort) {
                    if (!incoming.destroyed) incoming.destroy();
                    if (!request.destroyed) request.destroy();
                  }
                  if (strictAgent) strictAgent.destroy();
                  if (abort || strictAgent) await connectionClosedPromise;
                })();
              }
              return closePromise;
            },
          });
        },
      );
    } catch (error) {
      strictAgent?.destroy();
      reject(error);
      return;
    }

    request.once('socket', assignedSocket => {
      socket = assignedSocket;
      if (assignedSocket.destroyed) {
        markConnectionClosed();
        return;
      }
      assignedSocket.once('close', markConnectionClosed);
    });

    const absoluteTimer = setTimeout(() => {
      request.destroy(new Error('远程资源请求超时'));
    }, timeoutMs);
    absoluteTimer.unref?.();
    request.once('close', () => {
      clearTimeout(absoluteTimer);
      if (!socket || socket.destroyed) markConnectionClosed();
    });

    request.on('timeout', () => {
      request.destroy(new Error('远程资源请求超时'));
    });
    request.on('error', error => {
      strictAgent?.destroy();
      if (response) return;
      if (options.strictPublicNetwork) {
        void connectionClosedPromise.then(() => reject(error));
      } else {
        reject(error);
      }
    });
    request.end();
  });
}

function createStrictDirectAgent(url: URL, lookup: LookupFunction): http.Agent {
  const agentOptions: http.AgentOptions = {
    keepAlive: false,
    maxSockets: 1,
    maxTotalSockets: 1,
    lookup: lookup as any,
  };
  return url.protocol === 'https:' ? new https.Agent(agentOptions) : new http.Agent(agentOptions);
}

function shouldBlockPrivateNetwork(options: SafeDownloadOptions): boolean {
  if (options.strictPublicNetwork) return true;
  return Boolean(options.blockPrivateNetwork);
}

function stripSensitiveRedirectHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !SENSITIVE_REDIRECT_HEADERS.has(name.toLowerCase())),
  );
}

function readResponseBody(
  response: IncomingMessage,
  options: { maxBytes: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    response.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > options.maxBytes) {
        response.destroy(new Error('远程资源过大'));
        return;
      }
      chunks.push(new Uint8Array(chunk));
    });
    response.on('end', () => {
      resolve(Buffer.concat(chunks, totalBytes));
    });
    response.on('error', reject);
  });
}

function createSafeLookup(
  reservedProxyHosts: string[] = [],
  strictPublicNetwork = false,
  resolve: LookupFunction = dnsLookup as unknown as LookupFunction,
): LookupFunction {
  return (hostname, optionsOrCallback, maybeCallback?: LookupCallback) => {
    const options =
      typeof optionsOrCallback === 'function' ? {} : (optionsOrCallback as Record<string, any>);
    const callback =
      typeof optionsOrCallback === 'function'
        ? optionsOrCallback
        : (maybeCallback as LookupCallback);
    const wantsAll = Boolean(options?.all);

    resolve(hostname, { ...options, all: true } as LookupAllOptions, (error, records, family) => {
      if (error) {
        callback(error);
        return;
      }

      void resolveValidatedNetworkAddresses(
        hostname,
        // 自带解析可能忽略 all:true、只回一个地址
        normalizeLookupRecords(
          typeof records === 'string' ? { address: records, family: Number(family) } : records,
        ),
        reservedProxyHosts,
        strictPublicNetwork,
      )
        .then(resolvedRecords => {
          const requestedFamily = Number(options?.family || 0);
          const candidates =
            requestedFamily === 4 || requestedFamily === 6
              ? resolvedRecords.filter(record => record.family === requestedFamily)
              : resolvedRecords;
          if (!candidates.length) {
            callback(createLookupError('远程资源域名没有匹配的地址族'));
            return;
          }
          const selected = candidates[0];
          if (wantsAll) {
            callback(null, candidates);
            return;
          }
          callback(null, selected.address, selected.family);
        })
        .catch(error => {
          callback(
            error && typeof error === 'object' && 'code' in error
              ? (error as NodeJS.ErrnoException)
              : createLookupError('远程资源域名解析失败'),
          );
        });
    });
  };
}

export async function resolveValidatedNetworkAddresses(
  hostname: string,
  records: LookupAddress[],
  reservedProxyHosts: string[] = [],
  strictPublicNetwork = false,
): Promise<LookupAddress[]> {
  let resolvedRecords = normalizeLookupRecords(records);
  if (!resolvedRecords.length) throw createLookupError('远程资源域名解析失败');

  if (
    strictPublicNetwork &&
    resolvedRecords.every(record => StrictPublicDns.isBenchmarkProxyAddress(record.address))
  ) {
    Logger.warn(
      `严格公网下载检测到代理 DNS 地址，改用固定 TLS DNS 复核: ${normalizeHostname(hostname)}`,
      'SafeDownload',
    );
    try {
      resolvedRecords = normalizeLookupRecords(
        await StrictPublicDns.resolveStrictPublicHostname(normalizeHostname(hostname)),
      );
    } catch {
      throw createLookupError('严格公网 DNS 复核失败');
    }
    if (!resolvedRecords.length) throw createLookupError('严格公网 DNS 未返回可用地址');
  }

  const blockedRecord = resolvedRecords.find(
    record =>
      (strictPublicNetwork
        ? isBlockedNetworkAddress(record.address)
        : isBlockedResolvedNetworkAddress(record.address, hostname, reservedProxyHosts)) &&
      !(strictPublicNetwork ? false : shouldAllowDevResolvedAddress(hostname, record.address)),
  );
  if (blockedRecord) {
    Logger.warn(
      `远程资源下载拒绝解析后的受限地址: ${hostname} -> ${blockedRecord.address}`,
      'SafeDownload',
    );
    throw createLookupError('不允许访问内网或保留地址');
  }
  return resolvedRecords;
}

function assertStrictPublicNetworkOptions(options: SafeDownloadOptions): void {
  if (!options.strictPublicNetwork) return;
  normalizeStrictAllowedHosts(options.allowedHosts);
  if (options.lookup) throw new Error('严格公网下载不允许自定义 DNS 解析');
  if (options.reservedProxyHosts?.length) {
    throw new Error('严格公网下载不允许保留代理地址例外');
  }
  const allowedHeaders = new Set(['accept', 'accept-encoding', 'accept-language', 'user-agent']);
  if (Object.keys(options.headers || {}).some(name => !allowedHeaders.has(name.toLowerCase()))) {
    throw new Error('严格公网下载只允许固定的内容协商请求头');
  }
  assertStrictInteger(options.maxBytes, '字节上限', 1, STRICT_MAX_BYTES);
  assertStrictInteger(options.maxRedirects, '重定向上限', 0, STRICT_MAX_REDIRECTS);
  assertStrictInteger(options.timeoutMs, '超时上限', 1, STRICT_MAX_TIMEOUT_MS);
}

function assertStrictInteger(
  value: number | undefined,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (value != null && (!Number.isSafeInteger(value) || value < minimum || value > maximum)) {
    throw new Error(`严格公网下载${label}无效`);
  }
}

function normalizeStrictAllowedHosts(value?: string[]): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new Error('严格公网下载需要有界的精确主机列表');
  }
  const hosts = value.map(item => normalizeHostname(item));
  if (
    hosts.some(
      host =>
        !host ||
        isIP(host) ||
        host.startsWith('.') ||
        host.includes('*') ||
        host.includes('/') ||
        host.includes(':'),
    ) ||
    new Set(hosts).size !== hosts.length
  ) {
    throw new Error('严格公网下载主机列表必须是唯一的精确域名');
  }
  return hosts;
}

function normalizeLookupRecords(
  records: LookupAddress[] | LookupAddress | undefined,
): LookupAddress[] {
  const items = Array.isArray(records) ? records : records ? [records] : [];
  return items
    .map(record => {
      const address = String(record?.address || '').trim();
      const family = Number(record?.family || isIP(address));
      if (!address || (family !== 4 && family !== 6)) return null;
      return { address, family } as LookupAddress;
    })
    .filter((record): record is LookupAddress => Boolean(record));
}

function createLookupError(message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = 'EAI_BLOCKED';
  return error;
}

function getHeaderValue(value: string | string[] | number | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'undefined' ? '' : String(value);
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

function normalizeIpAddress(value: string): string {
  const normalized = stripIpv6Brackets(
    String(value || '')
      .trim()
      .toLowerCase(),
  );
  const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (mappedIpv4) return mappedIpv4;
  return normalized;
}

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(part => /^\d+$/.test(part) && Number(part) <= 255);
}

function isBlockedIPv4(value: string): boolean {
  const [a, b, c] = value.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isBenchmarkReservedIPv4(value: string): boolean {
  const [a, b] = value.split('.').map(Number);
  return a === 198 && (b === 18 || b === 19);
}

function shouldAllowDevResolvedAddress(hostname: string, address: string): boolean {
  if (!isDevLocalDownloadAllowed()) return false;
  if (!isLocalhostHostname(hostname) && !isLoopbackAddress(hostname)) return false;
  return isLoopbackAddress(address);
}

function isDevLocalDownloadAllowed(): boolean {
  return process.env.ISDEV === 'true' || process.env.NODE_ENV === 'development';
}

function isLocalhostHostname(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  return normalized === 'localhost' || normalized.endsWith('.localhost');
}

function isLoopbackAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address).toLowerCase();
  const mappedIpv4 = normalized.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  const value = mappedIpv4 || normalized;
  if (isIPv4(value)) {
    return Number(value.split('.')[0]) === 127;
  }
  return value === '::1';
}

function isReservedProxyResolutionAllowed(hostname?: string, reservedProxyHosts: string[] = []) {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname || isIP(normalizedHostname)) return false;

  const allowedHosts = [
    ...DEFAULT_RESERVED_PROXY_HOSTS,
    ...splitHostAllowlist(process.env.SAFE_DOWNLOAD_RESERVED_PROXY_HOSTS),
    ...reservedProxyHosts.flatMap(host => splitHostAllowlist(host)),
  ];

  return allowedHosts.some(allowedHost => matchAllowedHost(normalizedHostname, allowedHost));
}

function splitHostAllowlist(value?: string): string[] {
  return String(value || '')
    .split(',')
    .map(item => normalizeHostname(item))
    .filter(Boolean);
}

function normalizeHostname(hostname?: string): string {
  return stripIpv6Brackets(
    String(hostname || '')
      .trim()
      .toLowerCase(),
  ).replace(/\.$/, '');
}

function matchAllowedHost(hostname: string, allowedHost: string): boolean {
  if (!allowedHost) return false;
  if (allowedHost.startsWith('.')) {
    const suffix = allowedHost.slice(1);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === allowedHost;
}

function isBlockedIPv6(value: string): boolean {
  if (value.includes('%')) return true;
  try {
    return !GLOBAL_UNICAST_IPV6.check(value, 'ipv6') || BLOCKED_IPV6.check(value, 'ipv6');
  } catch {
    return true;
  }
}
