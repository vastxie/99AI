import { createRandomUid } from './createRandomUid';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('createRandomUid', () => {
  it('生成 9 位小写十六进制 uid 且互不重复', () => {
    const ids = Array.from({ length: 50 }, () => createRandomUid());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{9}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
