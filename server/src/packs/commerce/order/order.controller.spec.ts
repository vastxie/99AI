import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { OrderController } from './order.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;

function guardsOf(handler: unknown) {
  return Reflect.getMetadata(GUARDS_METADATA, handler as object);
}

describe('OrderController guards', () => {
  it('only lets registered users place orders and read their orders', () => {
    expect(guardsOf(OrderController.prototype.buy)).toEqual([RegisteredUserAuthGuard]);
    expect(guardsOf(OrderController.prototype.queryByOrderId)).toEqual([RegisteredUserAuthGuard]);
    expect(guardsOf(OrderController.prototype.buy)).not.toContain(JwtAuthGuard);
  });

  it('keeps the admin order routes behind SuperAuthGuard', () => {
    expect(guardsOf(OrderController.prototype.queryAllOrder)).toEqual([SuperAuthGuard]);
    expect(guardsOf(OrderController.prototype.deleteOrder)).toEqual([SuperAuthGuard]);
    expect(guardsOf(OrderController.prototype.deleteNotPay)).toEqual([SuperAuthGuard]);
  });
});
