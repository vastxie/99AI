import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { UserController } from './user.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('UserController self-service permissions', () => {
  it('keeps visitors away from self profile updates with the registered-user guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UserController.prototype.update);

    expect(guards).toEqual([RegisteredUserAuthGuard]);
    expect(guards).not.toContain(JwtAuthGuard);
  });
});
