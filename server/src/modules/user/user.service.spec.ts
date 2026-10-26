import { ArgumentMetadata, HttpStatus, ValidationPipe } from '@nestjs/common';
import { createMockQueryBuilder, createMockRepository } from '../../test/mocks/repository.mock';
import { UpdateUserDto } from './dto/updateUser.dto';
import { generateTemporaryPassword, UserService } from './user.service';
import { UserStatusEnum } from '@/common/constants/user.constant';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const updateBodyMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: UpdateUserDto,
  data: '',
};

describe('UserService.updateInfo security boundary', () => {
  let userRepository: any;
  let redisCacheService: any;
  let service: UserService;

  beforeEach(() => {
    userRepository = createMockRepository(jest.fn);
    redisCacheService = {
      del: jest.fn().mockResolvedValue(undefined),
    };
    service = new UserService(userRepository as any, {} as any, redisCacheService as any);
  });

  it('rejects privilege and authentication fields at the DTO boundary', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          role: 'super',
          status: 1,
          openId: 'OPEN_ID_SECRET',
          unionId: 'UNION_ID_SECRET',
        },
        updateBodyMetadata,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: HttpStatus.BAD_REQUEST }),
    });
  });

  it('only writes self-profile fields even if the service receives a polluted body', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 34,
      username: 'viewer34',
      nickname: '旧昵称',
    });
    userRepository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.updateInfo(
        {
          nickname: '新昵称',
          role: 'super',
          status: 1,
          password: 'plain-password',
          email: 'attacker@example.com',
          phone: '18888888888',
          openId: 'OPEN_ID_SECRET',
          unionId: 'UNION_ID_SECRET',
          legacyField: 'LEGACY',
          balance: 999999,
          quotaPlan: 99,
        } as any,
        { user: { id: 34, role: 'viewer' } } as any,
      ),
    ).resolves.toBe('修改用户昵称成功！');

    expect(userRepository.update).toHaveBeenCalledWith(
      { id: 34 },
      {
        nickname: '新昵称',
      },
    );
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('role');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('status');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('password');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('email');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('phone');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('openId');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('unionId');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('legacyField');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('balance');
    expect(userRepository.update.mock.calls[0][1]).not.toHaveProperty('quotaPlan');
  });

  it('does not update the user when only blocked fields are submitted', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 34,
      username: 'viewer34',
      nickname: '旧昵称',
    });

    let thrown: any;
    try {
      await service.updateInfo(
        {
          role: 'super',
          status: 1,
          openId: 'OPEN_ID_SECRET',
          unionId: 'UNION_ID_SECRET',
        } as any,
        { user: { id: 34, role: 'viewer' } } as any,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown?.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('refuses visitors with 403 before looking up a user row by the visitorId', async () => {
    let thrown: any;
    try {
      await service.updateInfo(
        { nickname: '新昵称' } as any,
        { user: { uid: 'visitor-uid', id: 'visitor:abc123', role: 'visitor' } } as any,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown?.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(userRepository.findOne).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });
});

describe('UserService password authentication boundary', () => {
  let userRepository: any;
  let redisCacheService: any;
  let service: UserService;

  beforeEach(() => {
    userRepository = createMockRepository(jest.fn);
    redisCacheService = {
      del: jest.fn().mockResolvedValue(undefined),
    };
    service = new UserService(userRepository as any, {} as any, redisCacheService as any);
  });

  it('rejects password login when the user has no password hash', async () => {
    userRepository.createQueryBuilder.mockReturnValue(
      createMockQueryBuilder({
        one: {
          id: 10,
          username: 'oauth-user',
          password: null,
          status: 1,
        },
      }),
    );

    await expect(
      service.verifyUserCredentials({
        username: 'oauth-user',
        password: 'any-password',
      }),
    ).rejects.toMatchObject({
      response: '该账号未设置密码，请使用第三方登录或验证码登录。',
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('returns false when verifying old password for a passwordless user', async () => {
    userRepository.createQueryBuilder.mockReturnValue(
      createMockQueryBuilder({
        one: {
          id: 10,
          password: '',
        },
      }),
    );

    await expect(service.verifyUserPassword(10, 'old-password')).resolves.toBe(false);
  });
});

describe('UserService account security revocation', () => {
  let userRepository: any;
  let redisCacheService: any;
  let service: UserService;

  beforeEach(() => {
    userRepository = createMockRepository(jest.fn);
    redisCacheService = {
      del: jest.fn().mockResolvedValue(undefined),
      invalidateUserSessions: jest.fn().mockResolvedValue(undefined),
    };
    service = new UserService(userRepository as any, {} as any, redisCacheService as any);
  });

  it('revokes all sessions after a successful password update', async () => {
    userRepository.update.mockResolvedValue({ affected: 1 });

    await service.updateUserPassword(42, 'new-password-123');

    expect(redisCacheService.invalidateUserSessions).toHaveBeenCalledWith(42);
  });

  it('resets to a strong random temporary password and revokes every session', async () => {
    userRepository.findOne.mockResolvedValue({ id: 42, role: 'user' });
    userRepository.update.mockResolvedValue({ affected: 1 });

    const message = await service.resetUserPass({ id: 42 } as any);

    const password = /\[([^\]]+)\]/.exec(message)?.[1] ?? '';
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(userRepository.update).toHaveBeenCalledWith(
      { id: 42 },
      { password: expect.not.stringContaining(password) },
    );
    expect(redisCacheService.invalidateUserSessions).toHaveBeenCalledWith(42);
  });

  it('never repeats temporary passwords in practice', () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));
    expect(passwords.size).toBe(200);
  });

  it('revokes sessions when an administrator makes an account inactive', async () => {
    userRepository.findOne.mockResolvedValue({ id: 42, role: 'user' });
    userRepository.update.mockResolvedValue({ affected: 1 });

    await service.updateStatus({ id: 42, status: UserStatusEnum.LOCKED } as any);

    expect(redisCacheService.invalidateUserSessions).toHaveBeenCalledWith(42);
  });

  it('fails closed for every non-active account state', async () => {
    userRepository.findOne.mockResolvedValue({ id: 42, status: UserStatusEnum.PENDING });

    await expect(service.checkUserStatus({ id: 42, role: 'user' })).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('treats an identity without a user id as expired instead of querying with it', async () => {
    userRepository.findOne.mockResolvedValue({ id: 1, status: UserStatusEnum.ACTIVE });

    await expect(service.checkUserStatus({ role: 'user' })).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });
});

describe('UserService visitor profile projection', () => {
  it('does not expose fingerprint-derived fields in visitor user info', async () => {
    const billing = {
      getSummary: jest.fn().mockResolvedValue({ plan: 'demo', quota: 10 }),
    };
    const service = new UserService({} as any, billing as any, {} as any);

    const result = await service.getUserInfo('visitor:VisitorUid01');
    const serialized = JSON.stringify(result);

    expect(result.userInfo).toMatchObject({
      username: '游客',
      nickname: '游客',
      email: null,
      role: 'visitor',
      id: 'visitor',
    });
    expect(serialized).not.toContain('visitor:VisitorUid01');
    expect(serialized).not.toContain('@visitor.com');
  });
});

describe('UserService file storage internal fields', () => {
  it('backfills missing storageId values on module init', async () => {
    const userRepository = createMockRepository(jest.fn);
    const redisCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    userRepository.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 7, storageId: null }])
      .mockResolvedValueOnce([]);
    userRepository.update.mockResolvedValue({ affected: 1 });

    const service = new UserService(userRepository as any, {} as any, redisCacheService as any);
    await service.onModuleInit();

    expect(userRepository.update).toHaveBeenCalledWith(
      { id: 7 },
      {
        storageId: expect.stringMatching(/^stor_[0-9A-Za-z]{18}$/),
      },
    );
    expect(redisCacheService.del).toHaveBeenCalledWith({ key: 'user:info:7' });
  });

  it('does not return storageId or avatarFileId in frontend user info', async () => {
    const userRepository = createMockRepository(jest.fn);
    const redisCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const billing = {
      getSummary: jest.fn().mockResolvedValue({ plan: 'demo', quota: 10 }),
    };
    const avatarFileId = 'file_ABCDEFGHIJKLMNOPQRSTUVWX';
    userRepository.findOne.mockResolvedValue({
      username: 'viewer',
      uid: 'UserUid00001',
      avatar: 'https://third-party.example.com/avatar.png',
      role: 'viewer',
      email: 'viewer@example.com',
      phone: null,
      nickname: 'viewer',
      customInstruction: null,
      storageId: 'stor_SECRET_STORAGE',
      avatarFileId,
    });

    const service = new UserService(
      userRepository as any,
      billing as any,
      redisCacheService as any,
    );
    const result = await service.getUserInfo(7);
    const serialized = JSON.stringify(result);

    expect(result.userInfo).not.toHaveProperty('storageId');
    expect(result.userInfo).not.toHaveProperty('avatarFileId');
    expect(result.userInfo.avatar).toBe(`/api/files/public/${avatarFileId}/preview`);
    expect(serialized).not.toContain('stor_SECRET_STORAGE');
    expect(serialized).not.toContain('https://third-party.example.com/avatar.png');
  });
});
