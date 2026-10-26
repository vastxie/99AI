import { maskToken, maskWechatId } from './log-mask';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('wechat log-mask', () => {
  it('keeps only a short prefix and suffix of WeChat identifiers', () => {
    expect(maskWechatId('o123456789abcdef')).toBe('o12***def');
  });

  it('never exposes token fragments', () => {
    expect(maskToken('ACCESS_TOKEN_SECRET')).toBe('[已隐藏]');
    expect(maskToken('')).toBe('');
  });
});
