import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { UserProfileController } from './user-profile.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('UserProfileController permissions', () => {
  it('protects the profile endpoint with SuperAuthGuard only', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      UserProfileController.prototype.getUserProfile,
    );

    expect(guards).toEqual(expect.arrayContaining([SuperAuthGuard]));
    expect(guards).not.toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  it('delegates profile lookup to UserProfileService with the parsed id and query', async () => {
    const userProfileService = {
      getProfile: jest.fn().mockResolvedValue({ basic: { id: 12 } }),
    };
    const controller = new UserProfileController(userProfileService as any);

    const result = await controller.getUserProfile(12, {
      range: '7d',
      recentLimit: 5,
    } as any);

    expect(userProfileService.getProfile).toHaveBeenCalledWith(12, {
      range: '7d',
      recentLimit: 5,
    });
    expect(result).toEqual({ basic: { id: 12 } });
  });
});
