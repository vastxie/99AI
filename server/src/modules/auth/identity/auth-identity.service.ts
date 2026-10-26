import { createUserUid, maskContact } from '@/common/utils';
import { UserStatusEnum, UserStatusErrMsg } from '@/common/constants/user.constant';
import { rethrowAsSafeException } from '@/common/utils/error-stack.util';
import {
  FileAssetFrontendProjection,
  FileAssetService,
} from '@/modules/fileAsset/fileAsset.service';
import { BILLING_PORT, BillingPort } from '@/modules/billing/billing.port';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { maxLength, minLength } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  EntityManager,
  FindOptionsWhere,
  Not,
  QueryDeepPartialEntity,
  Repository,
} from 'typeorm';
import { RedisCacheService } from '../../redisCache/redisCache.service';
import { UserEntity } from '../../user/user.entity';
import type { CreateUserInput } from '../../user/user.service';
import { LoginProviderRegistry } from '../providers/login-provider.registry';
import type { CaptchaLoginAdapter } from '../providers/login-provider.types';
import {
  AUTH_IDENTITY_STATUS,
  AuthContactField,
  AuthProvider,
  NormalizedAuthIdentity,
} from './auth-identity.types';
import { UserAuthIdentityEntity } from './user-auth-identity.entity';

const USER_UID_CREATE_RETRY_LIMIT = 8;

/** 联系方式的归属存在冲突（身份与 users 列指向不同账号、或多个老账号同值）：不自动判断哪条可信，交人工处理 */
export const CONTACT_CONFLICT_MESSAGE = '该联系方式的归属存在冲突，请联系管理员处理';
export const CONTACT_DISABLED_MESSAGE = '该登录方式已停用，请联系管理员';
const CONTACT_TAKEN_MESSAGE = '该联系方式已被其他账号绑定！';
const CONTACT_INCONSISTENT_MESSAGE = '该联系方式的数据不一致，请联系管理员处理';

/**
 * 联系方式（邮箱 / 手机号）的归属，见 findContactOwner：没有主人、主人、身份已停用、冲突
 */
export type ContactOwnership =
  | { kind: 'none' }
  | { kind: 'owner'; user: UserEntity }
  | { kind: 'disabled' }
  | { kind: 'conflict' };

class UserUidCollisionError extends Error {
  constructor(public readonly cause: unknown) {
    super('User uid collision');
  }
}

/** 身份记录写入值：scene 等为可空列，实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），写 null 时用本类型描述 */
type IdentityWriteValues = Omit<
  Partial<UserAuthIdentityEntity>,
  'scene' | 'linkKey' | 'email' | 'phone' | 'nickname' | 'avatar'
> & {
  scene?: string | null;
  linkKey?: string | null;
  email?: string | null;
  phone?: string | null;
  nickname?: string | null;
  avatar?: string | null;
};

/** 解绑验证码身份时清空 users 表联系方式列（可空列写 null） */
type UserContactPatch = { email?: string | null; phone?: string | null };

/** 判断「解绑之后还能不能登录」用的用户快照：联系方式按补丁可能已清空 */
type UserLoginSnapshot = {
  id: number;
  username: string | null;
  email: string | null;
  phone: string | null;
  password: string | null;
};

@Injectable()
export class AuthIdentityService {
  constructor(
    @InjectRepository(UserAuthIdentityEntity)
    private readonly identityRepository: Repository<UserAuthIdentityEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @Inject(BILLING_PORT) private readonly billing: BillingPort,
    private readonly redisCacheService: RedisCacheService,
    private readonly loginProviders: LoginProviderRegistry,
    private readonly fileAssetService?: FileAssetService,
  ) {}

  findByProviderUserId(
    provider: AuthProvider,
    providerUserId: string,
  ): Promise<UserAuthIdentityEntity | null> {
    return Promise.resolve().then(() => {
      if (!provider || !providerUserId) return null;
      return this.identityRepository.findOne({
        where: { provider, providerUserId, status: AUTH_IDENTITY_STATUS.ACTIVE },
        relations: { user: true },
      });
    });
  }

  /** 关联键由各登录渠道包定义（如同一生态内的联合 ID），任何渠道命中即视为同一个人 */
  findByLinkKey(linkKey?: string | null): Promise<UserAuthIdentityEntity | null> {
    return Promise.resolve().then(() => {
      if (!linkKey) return null;
      return this.identityRepository.findOne({
        where: { linkKey, status: AUTH_IDENTITY_STATUS.ACTIVE },
        relations: { user: true },
      });
    });
  }

  async loginOrCreateByIdentity(identity: NormalizedAuthIdentity): Promise<UserEntity> {
    this.assertNormalizedIdentity(identity);

    const existing = await this.findByProviderUserId(identity.provider, identity.providerUserId);
    if (existing) {
      this.assertUserCanLogin(existing.user);
      await this.updateIdentityProfile(existing, identity);
      await this.fillEmptyUserProfile(existing.user, identity);
      await this.syncUserAvatarFromIdentity(existing.user, identity, existing.id);
      await this.touchLastLogin(existing.id);
      return existing.user;
    }

    const linkedIdentity = await this.findByLinkKey(identity.linkKey);
    if (linkedIdentity) {
      this.assertUserCanLogin(linkedIdentity.user);
      const sameProvider = await this.findActiveProviderForUser(
        linkedIdentity.user.id,
        identity.provider,
      );
      if (sameProvider) {
        throw new HttpException('当前账号已绑定该类型登录方式！', HttpStatus.BAD_REQUEST);
      }
      const bound = await this.createIdentityForUser(linkedIdentity.user.id, identity);
      await this.fillEmptyUserProfile(linkedIdentity.user, identity);
      await this.syncUserAvatarFromIdentity(linkedIdentity.user, identity, bound.id);
      await this.touchLastLogin(bound.id);
      return linkedIdentity.user;
    }

    const user = await this.createUserWithIdentity(identity);
    return user;
  }

  async bindIdentity(userId: number, identity: NormalizedAuthIdentity) {
    this.assertNormalizedIdentity(identity);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new HttpException('当前绑定用户不存在！', HttpStatus.BAD_REQUEST);
    }
    this.assertUserCanLogin(user);

    const existing = await this.findByProviderUserId(identity.provider, identity.providerUserId);
    if (existing && existing.userId !== userId) {
      throw new HttpException('该登录方式已绑定其他账号！', HttpStatus.BAD_REQUEST);
    }
    if (existing && existing.userId === userId) {
      await this.updateIdentityProfile(existing, identity);
      await this.fillEmptyUserProfile(user, identity);
      await this.syncUserAvatarFromIdentity(user, identity, existing.id);
      return existing;
    }

    const linkedIdentity = await this.findByLinkKey(identity.linkKey);
    if (linkedIdentity && linkedIdentity.userId !== userId) {
      throw new HttpException('该登录方式已绑定其他账号！', HttpStatus.BAD_REQUEST);
    }

    const sameProvider = await this.identityRepository.findOne({
      where: {
        userId,
        provider: identity.provider,
        status: AUTH_IDENTITY_STATUS.ACTIVE,
      },
    });
    if (sameProvider) {
      throw new HttpException('当前账号已绑定该类型登录方式！', HttpStatus.BAD_REQUEST);
    }

    const created = await this.createIdentityForUser(userId, identity);
    await this.fillEmptyUserProfile(user, identity);
    await this.syncUserAvatarFromIdentity(user, identity, created.id);
    return created;
  }

  /**
   * 密码登录、验证码登录之后，把 users 表里已有的联系方式补成对应渠道的身份记录
   * （早期只写 users.email / users.phone 的老账号也能列出、解绑这些登录方式）。
   * 本人已有该渠道的身份就跳过（不加锁）；否则逐个渠道在事务里锁本人用户行、重读当前的列再写，
   * 只为无冲突的单一老账号补写。数据库的其他错误只记安全摘要、换成静态异常（登录失败）
   */
  async ensureContactIdentitiesForUser(user: UserEntity) {
    try {
      for (const adapter of this.loginProviders.listCaptcha()) {
        if (!user[adapter.contactField]) continue;
        const own = await this.identityRepository.findOne({
          where: { userId: user.id, provider: adapter.provider },
          select: { id: true },
        });
        if (!own) await this.backfillContactIdentity(user.id, adapter);
      }
    } catch (error) {
      rethrowAsSafeException(error, '补录登录身份失败', 'AuthIdentityService', () =>
        Object.assign(new HttpException('登录失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR), {
          controlled: true,
        }),
      );
    }
  }

  /**
   * 联系方式归属：先看身份（不限状态，与唯一索引 (provider, providerUserId) 同口径），没有身份再看 users 对应列（老账号）。
   * 身份的用户不存在、或另有账号的 users 列也是它、或没有身份而多个账号的列都是它 → 冲突；
   * 冲突优先于「已停用」。每条查询都在事务外，读最新提交的数据
   */
  async findContactOwner(adapter: CaptchaLoginAdapter, value: string): Promise<ContactOwnership> {
    const identity = await this.identityRepository.findOne({
      where: { provider: adapter.provider, providerUserId: value },
    });
    const holders = await this.userRepository.find({
      where: { [adapter.contactField]: value } as FindOptionsWhere<UserEntity>,
      take: 2,
    });
    if (identity) {
      const user = await this.userRepository.findOne({ where: { id: identity.userId } });
      if (!user || holders.some(holder => holder.id !== identity.userId)) {
        return { kind: 'conflict' };
      }
      if (identity.status !== AUTH_IDENTITY_STATUS.ACTIVE) return { kind: 'disabled' };
      return { kind: 'owner', user };
    }
    if (holders.length > 1) return { kind: 'conflict' };
    return holders.length ? { kind: 'owner', user: holders[0] } : { kind: 'none' };
  }

  /**
   * 验证码登录自动注册：建用户与写身份在同一事务里（与 OAuth 新用户同一个创建函数）。
   * 写身份撞唯一索引（别的请求先注册或绑定了同一联系方式，含数据库认为相等的写法）或死锁时本事务已整体回滚，
   * 返回 null，由调用方重新查找主人；提交之后的步骤（赠送等）出错照常抛出，不当作竞争
   */
  async registerContactUser(identity: NormalizedAuthIdentity): Promise<UserEntity | null> {
    this.assertNormalizedIdentity(identity);
    let created: { savedUser: UserEntity; savedIdentity: UserAuthIdentityEntity };
    try {
      created = await this.insertUserWithIdentity(identity);
    } catch (error) {
      if (!this.isRaceError(error)) throw error;
      Logger.warn('自动注册时联系方式已被并发请求占用，改为重新查找账号', 'AuthIdentityService');
      return null;
    }
    await this.afterUserCreated(created.savedUser, identity, created.savedIdentity.id);
    return created.savedUser;
  }

  /**
   * 验证码绑定：一个事务里先锁本人用户行、检查归属，再写身份并同步本人 users 列（幂等时写身份存的写法），
   * 提交后清用户缓存。撞唯一索引或死锁（并发请求抢先）时按最新数据给出具体的冲突提示，都不冲突就再试一次
   */
  async bindContactIdentity(userId: number, adapter: CaptchaLoginAdapter, value: string) {
    const identity = adapter.toIdentity(value, 'bind');
    this.assertNormalizedIdentity(identity);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.userRepository.manager.transaction(manager =>
          this.bindContactInTransaction(manager, userId, adapter, identity),
        );
      } catch (error) {
        if (!this.isRaceError(error)) throw error;
        await this.assertContactBindable(userId, adapter, identity.providerUserId);
        Logger.warn('绑定联系方式时与并发请求冲突，准备重试', 'AuthIdentityService');
        continue;
      }
      // 提交之后的步骤不属于竞争恢复：出错照常抛出，不重试事务
      await this.clearUserCache(userId);
      return;
    }
    throw new HttpException('绑定失败，请稍后重试', HttpStatus.CONFLICT);
  }

  /**
   * 能否把这个联系方式绑到本人：本人已有同一联系方式的 active 身份时返回它（幂等），可以新绑时返回 null；
   * 别人的身份或 users 列占用、本人身份已停用、本人已有该渠道的其他身份时抛出对应提示。
   * 不传 manager 时在事务外读最新提交的数据（发码前检查、并发冲突后的重新检查）
   */
  async assertContactBindable(
    userId: number,
    adapter: CaptchaLoginAdapter,
    value: string,
    manager: EntityManager = this.userRepository.manager,
  ): Promise<UserAuthIdentityEntity | null> {
    const identities = manager.getRepository(UserAuthIdentityEntity);
    const taken = await identities.findOne({
      where: { provider: adapter.provider, providerUserId: value },
    });
    if (taken && taken.userId !== userId) {
      throw new HttpException(CONTACT_TAKEN_MESSAGE, HttpStatus.BAD_REQUEST);
    }
    if (taken && taken.status !== AUTH_IDENTITY_STATUS.ACTIVE) {
      throw new HttpException(CONTACT_DISABLED_MESSAGE, HttpStatus.BAD_REQUEST);
    }
    const holder = await manager.getRepository(UserEntity).findOne({
      where: { [adapter.contactField]: value, id: Not(userId) } as FindOptionsWhere<UserEntity>,
      select: { id: true },
    });
    if (holder) throw new HttpException(CONTACT_TAKEN_MESSAGE, HttpStatus.BAD_REQUEST);
    if (taken) return taken;
    const sameProvider = await identities.findOne({
      where: { userId, provider: adapter.provider },
      select: { id: true },
    });
    if (sameProvider) {
      throw new HttpException('当前账号已绑定该类型登录方式！', HttpStatus.BAD_REQUEST);
    }
    return null;
  }

  async listUserIdentities(userId: number) {
    const rows = await this.identityRepository.find({
      where: { userId, status: AUTH_IDENTITY_STATUS.ACTIVE },
      order: { boundAt: 'ASC', createdAt: 'ASC' as any },
    });

    return rows.map(row => ({
      id: row.id,
      provider: row.provider,
      scene: row.scene,
      email: row.email ? maskContact(row.email) : null,
      phone: row.phone ? maskContact(row.phone) : null,
      nickname: row.nickname || null,
      avatar: row.avatar || null,
      status: row.status,
      boundAt: row.boundAt,
      lastLoginAt: row.lastLoginAt,
    }));
  }

  /**
   * 解绑一个登录身份。同一事务里先锁用户行，再读该用户的有效身份，按「解绑并清掉对应联系方式之后」的状态判断
   * 是否还有可用的登录方式（并发解绑同一用户的两个身份会在锁上排队，后到的看到前一次的结果）；
   * 删除身份与清空联系方式同事务提交，缓存在提交之后失效
   */
  async unbindIdentity(userId: number, identityId: number) {
    await this.userRepository.manager.transaction(async manager => {
      const users = manager.getRepository(UserEntity);
      const identityRepository = manager.getRepository(UserAuthIdentityEntity);
      const user = await users.findOne({
        where: { id: userId },
        select: { id: true, username: true, email: true, phone: true, password: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new HttpException('用户不存在。', HttpStatus.NOT_FOUND);
      }
      const identities = await identityRepository.find({
        where: { userId, status: AUTH_IDENTITY_STATUS.ACTIVE },
      });
      const target = identities.find(item => item.id === identityId);
      if (!target) {
        throw new HttpException('登录身份不存在或已解绑。', HttpStatus.NOT_FOUND);
      }
      // 同一个补丁既用于判断，也用于写库：只有 users 当前值仍等于这个身份的联系方式时才清空
      const contactPatch = this.contactPatchForUnbind(user, target);
      const remaining = identities.filter(item => item.id !== identityId);
      const canLogin = await this.canLoginAfterUnbind(
        users,
        { ...user, ...contactPatch },
        remaining,
      );
      if (!canLogin) {
        throw new HttpException(
          '解绑后将没有可用的登录方式，请先设置密码或绑定其他登录方式。',
          HttpStatus.BAD_REQUEST,
        );
      }
      const deleted = await identityRepository.delete({ id: identityId, userId });
      if (deleted.affected !== 1) {
        throw new HttpException('登录方式已变化，请刷新后重试。', HttpStatus.CONFLICT);
      }
      if (Object.keys(contactPatch).length > 0) {
        await users.update({ id: userId }, contactPatch as QueryDeepPartialEntity<UserEntity>);
      }
    });
    await this.clearUserCache(userId);
    return '解绑成功';
  }

  /** 某用户在某登录方式下的供应商侧 ID（如公众号 OpenID） */
  async getProviderUserId(userId: number, provider: AuthProvider): Promise<string | null> {
    const identity = await this.identityRepository.findOne({
      where: { userId, provider, status: AUTH_IDENTITY_STATUS.ACTIVE },
    });
    return identity?.providerUserId || null;
  }

  async getActiveUserById(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    this.assertUserCanLogin(user);
    return user;
  }

  async touchLastLogin(identityId: number) {
    await this.identityRepository.update({ id: identityId }, { lastLoginAt: new Date() });
  }

  private async createUserWithIdentity(identity: NormalizedAuthIdentity): Promise<UserEntity> {
    const { savedUser, savedIdentity } = await this.insertUserWithIdentity(identity);
    await this.afterUserCreated(savedUser, identity, savedIdentity.id);
    return savedUser;
  }

  /** 建用户并写身份（同一事务）；生成的 uid 撞车时整体重试 */
  private async insertUserWithIdentity(identity: NormalizedAuthIdentity) {
    for (let attempt = 0; attempt < USER_UID_CREATE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.insertUserWithIdentityOnce(identity);
      } catch (error) {
        if (!(error instanceof UserUidCollisionError)) throw error;
        Logger.warn('创建用户 UID 冲突，准备重试', 'AuthIdentityService');
      }
    }

    throw new HttpException('用户标识生成失败，请稍后重试。', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private insertUserWithIdentityOnce(identity: NormalizedAuthIdentity) {
    return this.userRepository.manager.transaction(async manager => {
      const userRepository = manager.getRepository(UserEntity);
      const identityRepository = manager.getRepository(UserAuthIdentityEntity);
      const userValues: CreateUserInput = {
        uid: createUserUid(),
        username: this.createUsername(identity),
        nickname: identity.nickname || null,
        avatar: '',
        email: identity.contactField === 'email' ? identity.email || null : null,
        phone: identity.contactField === 'phone' ? identity.phone || null : null,
        status: UserStatusEnum.ACTIVE,
      };
      // 可空列写 null：实体属性未标 | null，在仓库边界收口
      const user = userRepository.create(userValues as DeepPartial<UserEntity>);
      const savedUser = await this.saveIdentityUserWithUidGuard(userRepository, user);
      const identityEntity = this.createIdentityEntity(savedUser.id, identity, identityRepository);
      const savedIdentity = await identityRepository.save(identityEntity);
      await identityRepository.update({ id: savedIdentity.id }, {
        lastLoginAt: new Date(),
      } as Partial<UserAuthIdentityEntity>);
      return { savedUser, savedIdentity };
    });
  }

  /** 新用户提交之后：头像转存、注册赠送 */
  private async afterUserCreated(
    user: UserEntity,
    identity: NormalizedAuthIdentity,
    identityId: number,
  ) {
    await this.syncUserAvatarFromIdentity(user, identity, identityId);
    await this.billing.onUserRegistered(user.id);
    Logger.log('创建登录身份用户成功', 'AuthIdentityService');
  }

  /**
   * 绑定事务：锁本人用户行 → 检查归属 → 写身份（幂等时跳过）→ 同步本人 users 列。
   * 幂等时写入身份存的写法（不用本次输入的写法），users 列与身份的联系方式列保持逐字节相同，解绑才能同时清掉
   */
  private async bindContactInTransaction(
    manager: EntityManager,
    userId: number,
    adapter: CaptchaLoginAdapter,
    identity: NormalizedAuthIdentity,
  ) {
    const users = manager.getRepository(UserEntity);
    const identities = manager.getRepository(UserAuthIdentityEntity);
    const user = await users.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new HttpException('当前绑定用户不存在！', HttpStatus.BAD_REQUEST);
    }
    this.assertUserCanLogin(user);
    const existing = await this.assertContactBindable(
      userId,
      adapter,
      identity.providerUserId,
      manager,
    );
    let contact = identity.providerUserId;
    if (existing) {
      const stored = existing[adapter.contactField];
      if (!stored) throw new HttpException(CONTACT_INCONSISTENT_MESSAGE, HttpStatus.BAD_REQUEST);
      contact = stored;
    } else {
      await identities.save(this.createIdentityEntity(userId, identity, identities));
    }
    await users.update({ id: userId }, {
      [adapter.contactField]: contact,
    } as QueryDeepPartialEntity<UserEntity>);
  }

  /**
   * 补录一个渠道的身份：锁本人用户行并重读当前的列（解绑可能刚清掉），该联系方式已有身份、另有账号的列也是它、
   * 或本人已有该渠道的其他身份时跳过（不写任何身份）。撞唯一索引或死锁时跳过，其他错误照常抛出
   */
  private async backfillContactIdentity(userId: number, adapter: CaptchaLoginAdapter) {
    try {
      await this.userRepository.manager.transaction(async manager => {
        const users = manager.getRepository(UserEntity);
        const identities = manager.getRepository(UserAuthIdentityEntity);
        const current = await users.findOne({
          where: { id: userId },
          select: { id: true, email: true, phone: true },
          lock: { mode: 'pessimistic_write' },
        });
        const value = current?.[adapter.contactField];
        if (!value) return;
        const taken = await identities.findOne({
          where: { provider: adapter.provider, providerUserId: value },
          select: { id: true, userId: true },
        });
        if (taken) {
          if (taken.userId !== userId) {
            Logger.warn('补录登录身份时联系方式已归属其他账号，已跳过', 'AuthIdentityService');
          }
          return;
        }
        const holder = await users.findOne({
          where: { [adapter.contactField]: value, id: Not(userId) } as FindOptionsWhere<UserEntity>,
          select: { id: true },
        });
        if (holder) {
          Logger.warn('补录登录身份时发现其他账号使用同一联系方式，已跳过', 'AuthIdentityService');
          return;
        }
        const sameProvider = await identities.findOne({
          where: { userId, provider: adapter.provider },
          select: { id: true },
        });
        if (sameProvider) {
          Logger.warn('补录登录身份时本人已有该渠道的其他身份，已跳过', 'AuthIdentityService');
          return;
        }
        await identities.save(
          this.createIdentityEntity(userId, adapter.toIdentity(value, 'password'), identities),
        );
      });
    } catch (error) {
      if (!this.isRaceError(error)) throw error;
      Logger.warn('补录登录身份时与并发写入冲突，已跳过', 'AuthIdentityService');
    }
  }

  private async saveIdentityUserWithUidGuard(
    userRepository: Repository<UserEntity>,
    user: UserEntity,
  ) {
    try {
      return await userRepository.save(user);
    } catch (error) {
      if (this.isDuplicateEntryError(error)) {
        throw new UserUidCollisionError(error);
      }
      throw error;
    }
  }

  private createIdentityForUser(userId: number, identity: NormalizedAuthIdentity) {
    const entity = this.createIdentityEntity(userId, identity, this.identityRepository);
    return this.identityRepository.save(entity);
  }

  private findActiveProviderForUser(userId: number, provider: AuthProvider) {
    return this.identityRepository.findOne({
      where: {
        userId,
        provider,
        status: AUTH_IDENTITY_STATUS.ACTIVE,
      },
    });
  }

  private createIdentityEntity(
    userId: number,
    identity: NormalizedAuthIdentity,
    repository: Repository<UserAuthIdentityEntity>,
  ) {
    const values: IdentityWriteValues = {
      userId,
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      scene: identity.scene || null,
      linkKey: identity.linkKey || null,
      email: identity.email || null,
      emailVerified: Boolean(identity.emailVerified),
      phone: identity.phone || null,
      nickname: identity.nickname || null,
      avatar: null,
      status: AUTH_IDENTITY_STATUS.ACTIVE,
      boundAt: new Date(),
      profileSnapshot: identity.rawProfile || null,
      extra: identity.contactField
        ? { ...(identity.extra || {}), contactField: identity.contactField }
        : identity.extra || null,
    };
    // 可空列写 null：实体属性未标 | null，在仓库边界收口
    return repository.create(values as DeepPartial<UserAuthIdentityEntity>);
  }

  private isDuplicateEntryError(error: any) {
    return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
  }

  /** 并发写入抢先：撞唯一索引或死锁（InnoDB 已回滚整个事务） */
  private isRaceError(error: any) {
    return (
      this.isDuplicateEntryError(error) ||
      error?.code === 'ER_LOCK_DEADLOCK' ||
      error?.errno === 1213
    );
  }

  private async updateIdentityProfile(
    entity: UserAuthIdentityEntity,
    identity: NormalizedAuthIdentity,
  ) {
    await this.identityRepository.update(
      { id: entity.id },
      {
        scene: identity.scene || entity.scene,
        linkKey: identity.linkKey || entity.linkKey,
        email: identity.email || entity.email,
        emailVerified: identity.emailVerified ?? entity.emailVerified,
        phone: identity.phone || entity.phone,
        nickname: identity.nickname || entity.nickname,
        avatar: entity.avatar,
        profileSnapshot: identity.rawProfile || entity.profileSnapshot,
        extra: identity.extra || entity.extra,
      },
    );
  }

  private async fillEmptyUserProfile(user: UserEntity, identity: NormalizedAuthIdentity) {
    if (!user) return;
    const patch: Partial<UserEntity> = {};

    if (!user.username && identity.nickname) {
      patch.username = identity.nickname.slice(0, 12);
      user.username = patch.username;
    }
    if (!user.nickname && identity.nickname) {
      patch.nickname = identity.nickname;
      user.nickname = patch.nickname;
    }
    if (!Object.keys(patch).length) return;
    await this.userRepository.update({ id: user.id }, patch);
    await this.clearUserCache(user.id);
  }

  private async syncUserAvatarFromIdentity(
    user: UserEntity,
    identity: NormalizedAuthIdentity,
    identityId?: number,
  ) {
    if (!this.fileAssetService || !user?.id || !identity.avatar) return;

    const fullUser = await this.loadUserAvatarState(user.id);
    if (fullUser?.avatarFileId) {
      return;
    }

    try {
      const avatar = await this.fileAssetService.createAvatarFromUrl({
        url: identity.avatar,
        userId: user.id,
        provider: identity.provider,
      });
      await this.applyAvatarFileAsset(user.id, identityId, avatar);
      user.avatarFileId = avatar.fileId;
      user.avatar = avatar.publicUrl || avatar.previewUrl || '';
    } catch {
      Logger.warn('第三方头像转存失败，已跳过', 'AuthIdentityService');
    }
  }

  private async loadUserAvatarState(userId: number): Promise<UserEntity | null> {
    return await this.userRepository
      .createQueryBuilder('user')
      .addSelect(['user.avatarFileId'])
      .where('user.id = :userId', { userId })
      .getOne();
  }

  private async applyAvatarFileAsset(
    userId: number,
    identityId: number | undefined,
    avatar: FileAssetFrontendProjection,
  ) {
    const publicUrl = avatar.publicUrl || avatar.previewUrl || '';
    await this.userRepository.update(
      { id: userId },
      {
        avatarFileId: avatar.fileId,
        avatar: publicUrl,
      },
    );
    if (identityId) {
      await this.identityRepository.update({ id: identityId }, { avatar: publicUrl });
    }
    await this.clearUserCache(userId);
  }

  /**
   * 解绑验证码类身份时要清掉的 users 联系方式列：只有当前值仍等于这个身份的邮箱 / 手机号时才清
   * （否则 users 上已经是别的联系方式，不能误清；邮箱按大小写不敏感比较）
   */
  private contactPatchForUnbind(
    user: Pick<UserEntity, 'email' | 'phone'>,
    identity: UserAuthIdentityEntity,
  ): UserContactPatch {
    const field = this.resolveContactField(identity);
    const same = (current: string | null | undefined, value: string | null | undefined) =>
      Boolean(current && value) &&
      String(current).trim().toLowerCase() === String(value).trim().toLowerCase();
    if (field === 'email' && same(user.email, identity.email)) return { email: null };
    if (field === 'phone' && same(user.phone, identity.phone)) return { phone: null };
    return {};
  }

  /**
   * 解绑之后还能不能登录：剩下的身份里有当前可用的渠道（渠道包按开关与必需配置判断），
   * 或者设置了密码、且剩下的某个登录标识符合登录输入规则（2 – 50 个字符，与登录 DTO 同一套计数：
   * 代理对与变体选择符不单独计数）并只对应本用户
   * （与密码登录的查询口径一致：用户名、邮箱、手机号三列任一相等）
   */
  private async canLoginAfterUnbind(
    users: Repository<UserEntity>,
    after: UserLoginSnapshot,
    remaining: UserAuthIdentityEntity[],
  ): Promise<boolean> {
    for (const identity of remaining) {
      if (await this.loginProviders.isProviderUsable(identity.provider)) return true;
    }
    if (typeof after.password !== 'string' || !after.password) return false;
    for (const value of [after.username, after.email, after.phone]) {
      if (typeof value !== 'string' || !minLength(value, 2) || !maxLength(value, 50)) continue;
      const matches = await users.find({
        where: [{ username: value }, { email: value }, { phone: value }],
        select: { id: true },
        take: 2,
      });
      if (matches.length === 1 && matches[0].id === after.id) return true;
    }
    return false;
  }

  /** 新身份在 extra 里记了 contactField；早期记录按当前装载的验证码渠道推断 */
  private resolveContactField(identity: UserAuthIdentityEntity): AuthContactField | undefined {
    const recorded = (identity.extra as Record<string, any> | null)?.contactField;
    if (recorded === 'email' || recorded === 'phone') return recorded;
    return this.loginProviders.getCaptcha(identity.provider)?.contactField;
  }

  private async clearUserCache(userId: number) {
    await this.redisCacheService.del({ key: `user:info:${userId}` });
    await this.redisCacheService.del({ key: `user:billing:${userId}` });
  }

  private assertNormalizedIdentity(identity: NormalizedAuthIdentity) {
    if (!identity?.provider || !identity?.providerUserId) {
      throw new HttpException('登录身份参数不完整。', HttpStatus.BAD_REQUEST);
    }
  }

  /** 账号状态可以登录（存在且为正常状态），否则抛出对应提示 */
  assertUserCanLogin(user: UserEntity | null | undefined): asserts user is UserEntity {
    if (!user || user.status !== UserStatusEnum.ACTIVE) {
      const status = user?.status;
      throw new HttpException(
        (status !== undefined && UserStatusErrMsg[status]) || '当前账号不可登录。',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private createUsername(identity: NormalizedAuthIdentity) {
    return identity.nickname ? identity.nickname.slice(0, 12) : '';
  }
}
