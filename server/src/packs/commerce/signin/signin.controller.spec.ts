import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { SigninController } from './signin.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;

function guardsOf(handler: unknown) {
  return Reflect.getMetadata(GUARDS_METADATA, handler as object);
}

describe('SigninController guards', () => {
  it('guards sign-in, its status and its log for registered users only', () => {
    expect(guardsOf(SigninController.prototype.sign)).toEqual([RegisteredUserAuthGuard]);
    expect(guardsOf(SigninController.prototype.getStatus)).toEqual([RegisteredUserAuthGuard]);
    expect(guardsOf(SigninController.prototype.getSigninLog)).toEqual([RegisteredUserAuthGuard]);
  });
});
