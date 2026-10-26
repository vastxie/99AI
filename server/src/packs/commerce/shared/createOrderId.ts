import { randomHex } from '@/common/utils/random-id';

/** 订单号：32 位小写十六进制随机串（orderId 列长度 64） */
export function createOrderId(): string {
  return randomHex(32);
}
