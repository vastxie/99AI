import { isMaskedSecret, maskSecret } from './secret-mask.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('secret-mask.util', () => {
  it('masks the middle of long secrets and everything of short ones', () => {
    expect(maskSecret('demo-live-0123456789abcdef')).toBe('dem****cdef');
    expect(maskSecret('short')).toBe('********');
    expect(maskSecret('')).toBe('');
    expect(maskSecret(undefined)).toBe('');
  });

  it('recognises masked placeholders so they are never written back', () => {
    expect(isMaskedSecret(maskSecret('demo-live-0123456789abcdef'))).toBe(true);
    expect(isMaskedSecret('********')).toBe(true);
    expect(isMaskedSecret('demo-live-0123456789abcdef')).toBe(false);
    expect(isMaskedSecret('')).toBe(false);
    expect(isMaskedSecret(null)).toBe(false);
  });
});
