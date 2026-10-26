import { BadRequestException } from '@nestjs/common';
import { assertStorageRegion } from './object-storage.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('assertStorageRegion', () => {
  it('accepts lowercase letters, digits and hyphens as they are', () => {
    for (const region of ['us-east-1', 'oss-cn-hangzhou', 'ap-guangzhou', 'auto', ' eu-west-3 ']) {
      expect(assertStorageRegion(region)).toBe(region.trim());
    }
  });

  it('rejects anything else instead of rewriting it', () => {
    for (const region of ['', '  ', 'US-EAST-1', 'us_east_1', 'us east 1', 'cn.hangzhou']) {
      expect(() => assertStorageRegion(region)).toThrow(BadRequestException);
    }
  });
});
