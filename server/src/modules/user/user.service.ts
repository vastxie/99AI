import { requireRegisteredUser } from '@/common/auth/request-user';
import { AuthConfig } from '@/common/config/auth.config';
import { createStorageId, createUserUid } from '@/common/utils';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { randomInt } from 'crypto';

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import { DeepPartial, IsNull, Like, Not, Repository } from 'typeorm';
import { BILLING_PORT, BillingPort } from '../billing/billing.port';
import { UserStatusEnum, UserStatusErrMsg } from './../../common/constants/user.constant';
import { RedisCacheService } from './../redisCache/redisCache.service';
import { QueryAllUserDto } from './dto/queryAllUser.dto';
import { ResetUserPassDto } from './dto/resetUserPass.dto';
import { UpdateUserDto } from './dto/updateUser.dto';
import { UpdateUserStatusDto } from './dto/updateUserStatus.dto';
import { UserEntity } from './user.entity';
import { FILE_ID_PATTERN } from '@/common/constants/id-pattern.constant';

const SELF_PROFILE_UPDATE_FIELDS = ['username', 'nickname', 'avatar', 'customInstruction'] as const;

type SelfProfileUpdateField = (typeof SELF_PROFILE_UPDATE_FIELDS)[number];
type SafeSelfProfileUpdate = Pick<UpdateUserDto, SelfProfileUpdateField>;

/**
 * 创建用户入参：password / nickname / email / phone 为可空列。实体属性未标 | null
 * （strictNullChecks 下联合类型会让 design:type 退化为 Object、破坏 TypeORM 列元数据），写 null 时用本类型描述。
 */
export type CreateUserInput = Omit<
  Partial<UserEntity>,
  'password' | 'nickname' | 'email' | 'phone'
> & {
  password?: string | null;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** 去掉 0/O、1/l/I 等易混字符，方便管理员口头或截图转交 */
const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** 管理员重置用的临时密码：16 位强随机，大写、小写字母与数字至少各一个（密码长度上限 30） */
export function generateTemporaryPassword(length = 16): string {
  for (;;) {
    let password = '';
    for (let index = 0; index < length; index++) {
      password += TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)];
    }
    if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)) {
      return password;
    }
  }
}

@Injectable()
export class UserService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    @Inject(BILLING_PORT) private readonly billing: BillingPort,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  async onModuleInit() {
    await this.backfillMissingUids();
    await this.backfillMissingStorageIds();
  }

  /* 账号登录验证密码 扫码登录则不用 */
  async verifyUserCredentials(user: {
    username?: string;
    password?: string;
    phone?: string;
  }): Promise<UserEntity> {
    const { username, password } = user;
    let u = null;

    /* 普通登录 */
    if (username && password) {
      const where: any = [{ username }, { email: username }, { phone: username }];
      u = await this.userEntity
        .createQueryBuilder('user')
        .where(where)
        .addSelect('user.password')
        .getOne();
      if (!u) {
        throw new HttpException('账户或密码错误！', HttpStatus.BAD_REQUEST);
      }
      if (!this.hasPasswordHash(u.password)) {
        throw new HttpException(
          '该账号未设置密码，请使用第三方登录或验证码登录。',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!bcrypt.compareSync(password, u.password)) {
        throw new HttpException('账户或密码错误！', HttpStatus.BAD_REQUEST);
      }
    }

    if (!u) {
      throw new HttpException('账户或密码错误！', HttpStatus.BAD_REQUEST);
    }
    if (u.status !== UserStatusEnum.ACTIVE) {
      throw new HttpException(UserStatusErrMsg[u.status], HttpStatus.BAD_REQUEST);
    }

    return u;
  }

  async verifyUserPassword(userId: number, password: string) {
    const u = await this.userEntity
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .addSelect('user.password')
      .getOne();
    if (!this.hasPasswordHash(u?.password)) return false;
    return bcrypt.compareSync(password, u.password);
  }

  private hasPasswordHash(password?: string | null): password is string {
    return typeof password === 'string' && password.length > 0;
  }

  /* 检查用户状态 */
  async checkUserStatus(user: { id?: number; role?: string }) {
    const { id: userId, role } = user;
    if (role === 'visitor') return true;
    // 没有用户 ID 的身份按失效处理，不拿空值去查询
    const u = userId ? await this.userEntity.findOne({ where: { id: userId } }) : null;
    if (!u) {
      throw new HttpException('当前用户信息失效、请重新登录！', HttpStatus.UNAUTHORIZED);
    }
    if (u.status !== UserStatusEnum.ACTIVE) {
      throw new HttpException(UserStatusErrMsg[u.status], HttpStatus.UNAUTHORIZED);
    }
    return true;
  }

  /* 获取用户基础信息 */
  async getUserInfo(userId: number | string) {
    const isVisitor = typeof userId === 'string' && userId.startsWith('visitor:');

    if (isVisitor) {
      Logger.debug('检测到游客用户访问', 'UserService-getUserInfo');

      // 为游客创建默认用户信息
      const visitorInfo: any = {
        username: '游客',
        avatar: '',
        role: 'visitor',
        email: null,
        phone: null,
        nickname: '游客',
        customInstruction: null,
        id: 'visitor',
      };

      // 访客的账户摘要（没有计费实现时为 null）
      let billing: unknown = null;
      try {
        billing = await this.billing.getSummary(null);
      } catch (error) {
        Logger.debug(`访客账户摘要查询失败: ${error.message}`, 'UserService-getUserInfo');
      }

      return { userInfo: visitorInfo, billing };
    }

    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw new HttpException('当前用户信息失效、请重新登录！', HttpStatus.UNAUTHORIZED);
    }

    // 原有逻辑：处理正常用户（添加Redis缓存）
    const userInfoCacheKey = `user:info:${numericUserId}`;
    const billingCacheKey = `user:billing:${numericUserId}`;

    // 尝试从缓存获取用户信息
    let userInfo: any;
    let billing: unknown = null;

    try {
      const cachedUserInfo = await this.redisCacheService.get({ key: userInfoCacheKey });
      const cachedBilling = await this.redisCacheService.get({ key: billingCacheKey });

      if (cachedUserInfo && cachedBilling) {
        userInfo = JSON.parse(cachedUserInfo);
        billing = JSON.parse(cachedBilling);
      } else {
        // 缓存未命中，查询数据库
        userInfo = await this.userEntity.findOne({
          where: { id: numericUserId },
          select: {
            username: true,
            uid: true,
            avatar: true,
            role: true,
            email: true,
            phone: true,
            nickname: true,
            avatarFileId: true,
            customInstruction: true,
          },
        });

        if (!userInfo) {
          throw new HttpException('当前用户信息失效、请重新登录！', HttpStatus.UNAUTHORIZED);
        }

        userInfo = this.sanitizeUserInfoForFrontend(userInfo);

        billing = await this.billing.getSummary(numericUserId);

        // 将结果缓存2小时
        const cacheTime = 2 * 60 * 60; // 2小时
        await this.redisCacheService.set(
          {
            key: userInfoCacheKey,
            val: JSON.stringify(userInfo),
          },
          cacheTime,
        );
        await this.redisCacheService.set(
          {
            key: billingCacheKey,
            val: JSON.stringify(billing),
          },
          5 * 60, // 账户摘要缓存 5 分钟
        );
      }
    } catch (cacheError) {
      // 缓存失败时降级到数据库查询
      Logger.warn(
        `Redis缓存获取失败，降级到数据库查询: ${cacheError.message}`,
        'UserService-getUserInfo',
      );

      userInfo = await this.userEntity.findOne({
        where: { id: numericUserId },
        select: {
          username: true,
          uid: true,
          avatar: true,
          role: true,
          email: true,
          phone: true,
          nickname: true,
          avatarFileId: true,
          customInstruction: true,
        },
      });

      if (!userInfo) {
        throw new HttpException('当前用户信息失效、请重新登录！', HttpStatus.UNAUTHORIZED);
      }

      userInfo = this.sanitizeUserInfoForFrontend(userInfo);

      billing = await this.billing.getSummary(numericUserId);
    }

    userInfo = this.sanitizeUserInfoForFrontend(userInfo);

    // 对id进行处理
    const processedId = (numericUserId * 123 + 100000000).toString(36).toUpperCase().slice(-6);

    // 将处理后的id放入userInfo对象中
    userInfo.id = processedId;

    return { userInfo, billing };
  }

  /* 获取用户信息 */
  async getUserById(id: number) {
    return await this.userEntity.findOne({ where: { id } });
  }

  /* 修改用户信息 */
  async updateInfo(body: UpdateUserDto, req: Request) {
    const { id } = requireRegisteredUser(req);
    const updateData = this.pickSelfProfileUpdate(body);

    const u = await this.userEntity.findOne({ where: { id } });
    if (!u) {
      throw new HttpException('当前用户不存在！', HttpStatus.BAD_REQUEST);
    }

    if (!Object.keys(updateData).length) {
      throw new HttpException('没有可更新的用户资料字段！', HttpStatus.BAD_REQUEST);
    }

    // 检查是否有任何变更
    if (updateData.username && u.username === updateData.username) {
      throw new HttpException('用户名没有变更，无需更改！', HttpStatus.BAD_REQUEST);
    }
    if (updateData.nickname && u.nickname === updateData.nickname) {
      throw new HttpException('昵称没有变更，无需更改！', HttpStatus.BAD_REQUEST);
    }

    // 如果要修改用户名，检查用户名是否已被占用（含与他人邮箱 / 手机号冲突）
    if (updateData.username && (await this.isUsernameTaken(updateData.username, id))) {
      throw new HttpException('用户名已被占用！', HttpStatus.BAD_REQUEST);
    }

    const r = await this.userEntity.update({ id }, updateData);
    // 注意 undefined <= 0 为 false，不能写成 (r.affected ?? 0) <= 0
    if (r.affected !== undefined && r.affected <= 0) {
      throw new HttpException('修改用户信息失败！', HttpStatus.BAD_REQUEST);
    }

    // 清除用户信息缓存
    await this.clearUserCache(id);

    let message = '修改用户信息成功！';
    if (updateData.username) {
      message = '修改用户名成功！';
    } else if (updateData.nickname) {
      message = '修改用户昵称成功！';
    } else if (updateData.customInstruction !== undefined) {
      message = '修改自定义指令成功！';
    }

    return message;
  }

  private pickSelfProfileUpdate(body: UpdateUserDto): Partial<SafeSelfProfileUpdate> {
    return SELF_PROFILE_UPDATE_FIELDS.reduce<Partial<SafeSelfProfileUpdate>>((acc, field) => {
      const value = body?.[field];
      if (value !== undefined) {
        (acc as Record<SelfProfileUpdateField, unknown>)[field] = value;
      }
      return acc;
    }, {});
  }

  private sanitizeUserInfoForFrontend(userInfo: any) {
    if (!userInfo || typeof userInfo !== 'object') return userInfo;
    userInfo.avatar = this.resolveFrontendAvatarUrl(userInfo);
    delete userInfo.storageId;
    delete userInfo.avatarFileId;
    return userInfo;
  }

  private resolveFrontendAvatarUrl(userInfo: any): string {
    const avatarFileId = String(userInfo?.avatarFileId || '').trim();
    if (FILE_ID_PATTERN.test(avatarFileId)) {
      return `/api/files/public/${avatarFileId}/preview`;
    }
    return userInfo?.avatar || '';
  }

  /**
   * 检查用户名是否已被占用。
   * 登录时用户名 / 邮箱 / 手机号三列同名匹配，因此用户名也不能与任何账号的邮箱或手机号相同，
   * 否则可以注册一个等于他人邮箱的用户名，把对方挡在登录之外。
   */
  async isUsernameTaken(username: string, excludeUserId?: number): Promise<boolean> {
    const value = String(username || '').trim();
    if (!value) return false;
    const exclude = excludeUserId ? { id: Not(excludeUserId) } : {};
    const user = await this.userEntity.findOne({
      where: [
        { username: value, ...exclude },
        { email: value, ...exclude },
        { phone: value, ...exclude },
      ],
      select: { id: true },
    });
    return !!user;
  }

  /* 修改用户密码 */
  async updateUserPassword(userId: number, password: string) {
    const hashedPassword = bcrypt.hashSync(password, AuthConfig.bcrypt.rounds);
    const r = await this.userEntity.update({ id: userId }, { password: hashedPassword });
    if (r.affected !== undefined && r.affected <= 0) {
      throw new HttpException('修改密码失败、请重新试试吧。', HttpStatus.BAD_REQUEST);
    }
    await this.redisCacheService.invalidateUserSessions(userId);
  }

  /* 查询所有用户 */
  async queryAll(query: QueryAllUserDto, req: Request) {
    const { page = 1, size = 10, username, email, status, keyword, phone, nickname } = query;
    let where = {};
    username && Object.assign(where, { username: Like(`%${username}%`) });
    email && Object.assign(where, { email: Like(`%${email}%`) });
    phone && Object.assign(where, { phone: Like(`%${phone}%`) });
    nickname && Object.assign(where, { nickname: Like(`%${nickname}%`) });
    status && Object.assign(where, { status });
    if (keyword) {
      where = [
        { username: Like(`%${keyword}%`) },
        { email: Like(`%${keyword}%`) },
        { phone: Like(`%${keyword}%`) },
        { nickname: Like(`%${keyword}%`) },
      ];
    }
    const [rows, count] = await this.userEntity.findAndCount({
      skip: (page - 1) * size,
      where,
      take: size,
      order: { createdAt: 'DESC' },
      cache: true,
      select: {
        username: true,
        uid: true,
        avatar: true,
        role: true,
        status: true,
        id: true,
        email: true,
        createdAt: true,
        lastLoginIp: true,
        phone: true,
        nickname: true,
        avatarFileId: true,
      },
    });
    // 账户摘要由计费实现批量提供（没有实现时为 null），对内核不透明
    const ids = rows.map(t => t.id);
    const summaries = await this.billing.getSummaries(ids);
    rows.forEach((user: any) => {
      user.avatar = this.resolveFrontendAvatarUrl(user);
      delete user.avatarFileId;
      user.billing = summaries.find(t => t.userId === user.id)?.summary ?? null;
    });
    return { rows, count };
  }

  /* 修改用户状态 */
  async updateStatus(body: UpdateUserStatusDto) {
    const { id, status } = body;
    const n = await this.userEntity.findOne({ where: { id } });
    if (!n) {
      throw new HttpException('用户不存在！', HttpStatus.BAD_REQUEST);
    }
    if (n.role === 'super') {
      throw new HttpException('超级管理员不可被操作！', HttpStatus.BAD_REQUEST);
    }
    if (n.role === 'super') {
      throw new HttpException('超级管理员不可被操作！', HttpStatus.BAD_REQUEST);
    }
    const r = await this.userEntity.update({ id }, { status });
    if (r.affected !== undefined && r.affected <= 0) {
      throw new HttpException('修改用户状态失败！', HttpStatus.BAD_REQUEST);
    }
    if (status !== UserStatusEnum.ACTIVE) {
      await this.redisCacheService.invalidateUserSessions(id);
    }
    return '修改用户状态成功！';
  }

  /* 重置用户密码 */
  async resetUserPass(body: ResetUserPassDto) {
    const { id } = body;
    const u = await this.userEntity.findOne({ where: { id } });
    if (!u) {
      throw new HttpException('用户不存在！', HttpStatus.BAD_REQUEST);
    }
    // 临时密码由管理员转交用户；改密会撤销该用户的全部会话，旧令牌随之失效
    const tempPassword = generateTemporaryPassword();
    await this.updateUserPassword(id, tempPassword);
    return `密码已重置为临时密码 [${tempPassword}]，请通知用户尽快登录修改。`;
  }

  /** 内容过滤命中：累计用户违规次数（列由内核持有，过滤实现来自扩展包） */
  async recordContentViolation(userId: number) {
    await this.userEntity.increment({ id: userId }, 'violationCount', 1);
  }

  /* 记录登录ip */
  async savaLoginIp(userId: number, ip: string) {
    return await this.userEntity.update({ id: userId }, { lastLoginIp: ip });
  }

  /* 清除用户相关缓存的辅助方法 */
  async clearUserCache(userId: number) {
    try {
      const userInfoCacheKey = `user:info:${userId}`;
      const billingCacheKey = `user:billing:${userId}`;

      await this.redisCacheService.del({ key: userInfoCacheKey });
      await this.redisCacheService.del({ key: billingCacheKey });

      Logger.debug(`已清除用户缓存: ${userId}`, 'UserService-clearUserCache');
    } catch (error) {
      Logger.warn(`清除用户缓存失败: ${error.message}`, 'UserService-clearUserCache');
    }
  }

  /* 创建基础用户 */
  async createUser(userInfo: CreateUserInput) {
    const user = { ...userInfo };
    if (!user.uid) {
      user.uid = await this.createUniqueUserUid();
    }
    if (!user.storageId) {
      user.storageId = createStorageId();
    }
    return await this.saveUserWithUidRetry(user);
  }

  /** 账号密码自助注册：密码在此加密，其余字段与 createUser 一致 */
  async createPasswordUser(userInfo: {
    username: string;
    password: string;
    nickname?: string | null;
    status?: number;
  }) {
    const { password, ...rest } = userInfo;
    return this.createUser({
      ...rest,
      password: bcrypt.hashSync(password, AuthConfig.bcrypt.rounds),
    });
  }

  async ensureUserUid(user: UserEntity): Promise<UserEntity> {
    if (user?.uid) return user;
    if (!user?.id) {
      throw new HttpException('用户信息缺少内部标识，无法签发登录凭证。', HttpStatus.UNAUTHORIZED);
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const uid = await this.createUniqueUserUid();
      try {
        await this.userEntity.update({ id: user.id }, { uid });
        user.uid = uid;
        await this.clearUserCache(user.id);
        return user;
      } catch (error: any) {
        if (error?.code === 'ER_DUP_ENTRY') continue;
        throw error;
      }
    }

    throw new HttpException('用户标识生成失败，请稍后重试。', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async backfillMissingUids() {
    try {
      let updatedCount = 0;
      while (true) {
        const rows = await this.userEntity.find({
          where: [{ uid: IsNull() }, { uid: '' }],
          select: { id: true, uid: true },
          take: 500,
          order: { id: 'ASC' },
        });
        if (!rows.length) break;

        for (const row of rows) {
          await this.ensureUserUid(row);
          updatedCount += 1;
        }
      }

      if (updatedCount > 0) {
        Logger.log(`已补全用户对外标识: ${updatedCount} 个`, 'UserService');
      }
    } catch (error) {
      Logger.error(`补全用户对外标识失败: ${error.message}`, getErrorStack(error), 'UserService');
    }
  }

  private async backfillMissingStorageIds() {
    try {
      let updatedCount = 0;
      while (true) {
        const rows = await this.userEntity.find({
          where: [{ storageId: IsNull() }, { storageId: '' }],
          select: { id: true, storageId: true },
          take: 500,
          order: { id: 'ASC' },
        });
        if (!rows.length) break;

        for (const row of rows) {
          await this.ensureUserStorageId(row);
          updatedCount += 1;
        }
      }

      if (updatedCount > 0) {
        Logger.log(`已补全用户私有文件存储分区标识: ${updatedCount} 个`, 'UserService');
      }
    } catch (error) {
      Logger.error(
        `补全用户私有文件存储分区标识失败: ${error.message}`,
        getErrorStack(error),
        'UserService',
      );
    }
  }

  private async ensureUserStorageId(user: UserEntity): Promise<UserEntity> {
    if (user?.storageId) return user;
    if (!user?.id) {
      throw new HttpException('用户信息缺少内部标识，无法补全存储分区。', HttpStatus.UNAUTHORIZED);
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const storageId = createStorageId();
      try {
        await this.userEntity.update({ id: user.id }, { storageId });
        user.storageId = storageId;
        await this.clearUserCache(user.id);
        return user;
      } catch (error: any) {
        if (error?.code === 'ER_DUP_ENTRY') continue;
        throw error;
      }
    }

    throw new HttpException('用户存储分区生成失败，请稍后重试。', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async createUniqueUserUid(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const uid = createUserUid();
      const existing = await this.userEntity.findOne({ where: { uid }, select: { id: true } });
      if (!existing) return uid;
    }
    throw new HttpException('用户标识生成失败，请稍后重试。', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async saveUserWithUidRetry(userInfo: CreateUserInput): Promise<UserEntity> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        // 可空列写 null：实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），在仓库边界收口
        return await this.userEntity.save(userInfo as DeepPartial<UserEntity>);
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        userInfo.uid = await this.createUniqueUserUid();
        userInfo.storageId = createStorageId();
      }
    }
    throw new HttpException('用户标识生成失败，请稍后重试。', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
