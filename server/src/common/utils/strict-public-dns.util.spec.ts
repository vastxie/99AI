import {
  isBenchmarkProxyAddress,
  parseStrictDohResponse,
  resolveStrictPublicHostname,
} from './strict-public-dns.util';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function response(hostname: string, type: number, answers: Array<Record<string, unknown>>) {
  return Buffer.from(
    JSON.stringify({
      Status: 0,
      TC: false,
      Question: [{ name: `${hostname}.`, type }],
      Answer: answers,
    }),
    'utf8',
  );
}

describe('strict public DNS fallback', () => {
  it('recognizes only the complete benchmark proxy range', () => {
    expect(isBenchmarkProxyAddress('198.18.0.1')).toBe(true);
    expect(isBenchmarkProxyAddress('198.19.255.254')).toBe(true);
    expect(isBenchmarkProxyAddress('198.20.0.1')).toBe(false);
    expect(isBenchmarkProxyAddress('127.0.0.1')).toBe(false);
    expect(isBenchmarkProxyAddress('not-an-ip')).toBe(false);
  });

  it('parses only the matching bounded A or AAAA answer shape', () => {
    expect(
      parseStrictDohResponse(
        response('example.com', 1, [
          { name: 'example.com.', type: 5, data: 'alias.example.net.' },
          { name: 'alias.example.net.', type: 1, data: '93.184.216.34' },
        ]),
        'example.com',
        4,
      ),
    ).toEqual([{ address: '93.184.216.34', family: 4 }]);
    expect(() =>
      parseStrictDohResponse(response('other.example', 1, []), 'example.com', 4),
    ).toThrow(/不匹配/);
    expect(() =>
      parseStrictDohResponse(
        response('example.com', 1, [{ name: 'example.com.', type: 1, data: 'not-an-address' }]),
        'example.com',
        4,
      ),
    ).toThrow(/地址无效/);
  });

  it('queries both families, deduplicates answers and fails closed without an address', async () => {
    const query = jest.fn(async (_hostname: string, family: 4 | 6) =>
      family === 4
        ? [
            { address: '93.184.216.34', family: 4 },
            { address: '93.184.216.34', family: 4 },
          ]
        : [{ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }],
    );
    await expect(resolveStrictPublicHostname('Example.COM.', query)).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
    expect(query).toHaveBeenCalledTimes(2);
    await expect(resolveStrictPublicHostname('example.com', async () => [])).rejects.toThrow(
      /未返回可用地址/,
    );
  });
});
