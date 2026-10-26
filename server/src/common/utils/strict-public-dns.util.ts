import type { LookupAddress } from 'dns';
import * as https from 'https';
import { isIP } from 'net';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DOH_MAX_BYTES = 64 * 1024;
const DOH_TIMEOUT_MS = 3_000;
const DOH_MAX_ANSWERS = 128;
const DOH_USER_AGENT = '99Agent-StrictPublicDNS/1.0';

type DnsFamily = 4 | 6;
type StrictDnsQuery = (hostname: string, family: DnsFamily) => Promise<LookupAddress[]>;

function normalizedHostname(value: string): string {
  const hostname = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/u, '');
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname.includes('..') ||
    !/^[a-z0-9.-]+$/u.test(hostname)
  ) {
    throw new Error('严格公网 DNS 主机名无效');
  }
  return hostname;
}

function finishError(message: string): Error {
  return new Error(message);
}

export function isBenchmarkProxyAddress(address: string): boolean {
  const parts = String(address || '')
    .trim()
    .split('.')
    .map(Number);
  return (
    parts.length === 4 &&
    parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
    parts[0] === 198 &&
    (parts[1] === 18 || parts[1] === 19)
  );
}

export function parseStrictDohResponse(
  body: Buffer,
  hostname: string,
  family: DnsFamily,
): LookupAddress[] {
  if (!body.length || body.length > DOH_MAX_BYTES) {
    throw finishError('严格公网 DNS 响应大小无效');
  }
  let value: any;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw finishError('严格公网 DNS 响应不是有效 JSON');
  }
  const expectedHostname = normalizedHostname(hostname);
  const expectedType = family === 4 ? 1 : 28;
  if (!value || typeof value !== 'object' || value.Status !== 0 || value.TC === true) {
    throw finishError('严格公网 DNS 查询失败');
  }
  if (
    !Array.isArray(value.Question) ||
    !value.Question.some(
      (question: any) =>
        normalizedHostname(String(question?.name || '')) === expectedHostname &&
        Number(question?.type) === expectedType,
    )
  ) {
    throw finishError('严格公网 DNS 问题与请求不匹配');
  }
  const answers = value.Answer == null ? [] : value.Answer;
  if (!Array.isArray(answers) || answers.length > DOH_MAX_ANSWERS) {
    throw finishError('严格公网 DNS 答案数量无效');
  }
  const records: LookupAddress[] = [];
  for (const answer of answers) {
    if (!answer || typeof answer !== 'object' || Number(answer.type) !== expectedType) continue;
    const address = String(answer.data || '').trim();
    if (isIP(address) !== family) throw finishError('严格公网 DNS 地址无效');
    records.push({ address, family });
  }
  return records;
}

function queryStrictDoh(hostname: string, family: DnsFamily): Promise<LookupAddress[]> {
  const url = new URL(DOH_ENDPOINT);
  url.searchParams.set('name', normalizedHostname(hostname));
  url.searchParams.set('type', family === 4 ? 'A' : 'AAAA');
  const agent = new https.Agent({ keepAlive: false, maxSockets: 1, maxTotalSockets: 1 });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, records?: LookupAddress[]) => {
      if (settled) return;
      settled = true;
      agent.destroy();
      if (error) reject(error);
      else resolve(records || []);
    };
    const request = https.request(
      url,
      {
        method: 'GET',
        agent,
        headers: {
          Accept: 'application/dns-json',
          'Accept-Encoding': 'identity',
          'User-Agent': DOH_USER_AGENT,
        },
      },
      response => {
        const contentType = String(response.headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (
          response.statusCode !== 200 ||
          !['application/dns-json', 'application/json'].includes(contentType)
        ) {
          response.destroy();
          finish(finishError('严格公网 DNS 服务返回无效响应'));
          return;
        }
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        response.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > DOH_MAX_BYTES) {
            response.destroy(finishError('严格公网 DNS 响应过大'));
            return;
          }
          chunks.push(new Uint8Array(chunk));
        });
        response.on('end', () => {
          try {
            finish(
              undefined,
              parseStrictDohResponse(Buffer.concat(chunks, totalBytes), hostname, family),
            );
          } catch (error) {
            finish(error instanceof Error ? error : finishError('严格公网 DNS 解析失败'));
          }
        });
        response.on('error', error => finish(error));
      },
    );
    const timer = setTimeout(
      () => request.destroy(finishError('严格公网 DNS 请求超时')),
      DOH_TIMEOUT_MS,
    );
    timer.unref?.();
    request.once('close', () => clearTimeout(timer));
    request.on('error', error => finish(error));
    request.end();
  });
}

export async function resolveStrictPublicHostname(
  hostname: string,
  query: StrictDnsQuery = queryStrictDoh,
): Promise<LookupAddress[]> {
  const normalized = normalizedHostname(hostname);
  const results = await Promise.allSettled([query(normalized, 4), query(normalized, 6)]);
  const records = results.flatMap(result => (result.status === 'fulfilled' ? result.value : []));
  const unique = new Map<string, LookupAddress>();
  for (const record of records) {
    const address = String(record?.address || '').trim();
    const family = Number(record?.family || isIP(address));
    if (!address || (family !== 4 && family !== 6) || isIP(address) !== family) {
      throw finishError('严格公网 DNS 返回了无效地址');
    }
    unique.set(`${family}:${address}`, { address, family });
  }
  if (!unique.size) throw finishError('严格公网 DNS 未返回可用地址');
  return [...unique.values()].sort((left, right) => left.family - right.family);
}
