import { maskContact, maskSensitiveValue } from './log-mask.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('log-mask.util', () => {
  it('masks verification contacts', () => {
    expect(maskContact('13812345678')).toBe('138****5678');
    expect(maskContact('admin@example.com')).toBe('a***n@example.com');
  });

  it('hides values that are too short to keep a visible prefix and suffix', () => {
    expect(maskSensitiveValue('short')).toBe('[已隐藏]');
    expect(maskSensitiveValue('0123456789abcdef')).toBe('0123***cdef');
  });
});
