import { createOrderId } from './createOrderId';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('createOrderId', () => {
  it('生成 32 位小写十六进制订单号且互不重复', () => {
    const ids = Array.from({ length: 50 }, () => createOrderId());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
