import { RedisClientType } from 'redis';
import { clearKeyCache, getOrInitCryptoKey, WeixinCrypto } from './weixin-crypto';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function fixtureStore(initial: string | null) {
  let encoded = initial;
  const store = {
    get: jest.fn(async () => encoded),
    set: jest.fn(async (_name: string, value: string, options: { NX: boolean }) => {
      if (options.NX && encoded !== null) return null;
      encoded = value;
      return 'OK';
    }),
    del: jest.fn(),
  };
  return { store, client: store as unknown as RedisClientType, read: () => encoded };
}

describe('current Weixin credential key format', () => {
  beforeEach(() => clearKeyCache());

  it('initializes a missing key once across concurrent callers and decrypts across cache resets', async () => {
    const { store, client, read } = fixtureStore(null);
    const keys = await Promise.all(Array.from({ length: 6 }, () => getOrInitCryptoKey(client)));
    expect(new Set(keys.map(key => key.toString('base64'))).size).toBe(1);
    expect(read()).toBe(keys[0].toString('base64'));
    expect(
      store.set.mock.calls.every((call: [string, string, { NX: boolean }]) => call[2].NX === true),
    ).toBe(true);
    const encrypted = await WeixinCrypto.encrypt('synthetic credential payload', client);
    clearKeyCache();
    expect(await WeixinCrypto.decrypt(encrypted, client)).toBe('synthetic credential payload');
    expect(store.del).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'invalid encoding',
    Buffer.alloc(31).toString('base64'),
    `${Buffer.alloc(32).toString('base64')}\n`,
  ])(
    'rejects malformed persisted keys without replacing or caching them',
    async (encoded: string) => {
      const { store, client, read } = fixtureStore(encoded);
      await expect(getOrInitCryptoKey(client)).rejects.toThrow('微信凭据密钥配置无效');
      await expect(getOrInitCryptoKey(client)).rejects.toThrow('微信凭据密钥配置无效');
      expect(store.get).toHaveBeenCalledTimes(2);
      expect(store.set).not.toHaveBeenCalled();
      expect(store.del).not.toHaveBeenCalled();
      expect(read()).toBe(encoded);
    },
  );

  it('keeps the existing current key without writing Redis', async () => {
    const encoded = Buffer.alloc(32, 7).toString('base64');
    const { store, client } = fixtureStore(encoded);
    expect((await getOrInitCryptoKey(client)).toString('base64')).toBe(encoded);
    expect(store.set).not.toHaveBeenCalled();
  });
});
