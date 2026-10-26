import { requireRegisteredUser, requireRequestUser } from '@/common/auth/request-user';
import { RechargeType } from '../shared/balance.constant';
import { ChatLogStatus } from '@/common/constants/status.constant';
import { createRandomUid } from '../shared/createRandomUid';
import { getErrorStack, getSafeErrorSummary } from '@/common/utils/error-stack.util';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { RedisClientType } from 'redis';
import { DataSource, DeepPartial, EntityManager, In, Repository } from 'typeorm';
import { PackageEntity } from '../package/package.entity';
import { ConfigEntity } from '@/modules/globalConfig/config.entity';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { AccountLogEntity } from './accountLog.entity';
import { UserBalanceEntity } from './userBalance.entity';
import dayjs from 'dayjs';
import { formatDate } from '@/common/utils/date';
import { formatCreateOrUpdateDate } from '../shared/date.util';
import { createHash } from 'crypto';

import { ChatLogEntity } from '@/modules/chatLog/chatLog.entity';
import { UserEntity } from '@/modules/user/user.entity';
import type { BillingActor } from '@/modules/billing/billing.port';
import type { OrderEntity } from '../order/order.entity';

interface LogInfo {
  userId: number;
  rechargeType: number;
  credits?: number;
  days?: number;
  pkgName?: string;
  extent?: string;
  packageId?: number | null;
  memberDays?: number | null;
}

interface UserBalanceInfo {
  credits?: number;
}

/** 给账户加额度时的入参：套餐充值带 packageId / 权重快照，纯积分充值只有 credits */
interface BalanceGrant {
  credits?: number;
  days?: number;
  packageId?: number | null;
  weight?: number | null;
  weightSnapshot?: number | null;
}

/** 账户变更记录的分页查询条件（管理端） */
interface AccountLogQuery {
  page?: number;
  size?: number;
  userId?: number;
  rechargeType?: number;
  packageId?: number | string;
}

/** queryUserBalance 的返回形态（访客返回全零默认值） */
export interface UserBalanceSummary {
  packageId: number | null;
  packageWeight: number;
  packageName: string;
  credits: number;
  memberCredits: number;
  usedCredits: number;
  usedTokens: number;
  expirationTime: string | null;
  sumCredits: number;
  isMember: boolean;
}

const CHAT_TURN_CHARGE_MARKERS = ['chat-base-v1', 'chat-tool-v1'] as const;
const CHAT_TURN_REFUND_BATCH_SIZE = 200;
const CHAT_TURN_SYSTEM_RECOVERY_ORIGIN = 'service-recovery-v1';

/** 账户日志写入值：packageId / memberDays / relatedId 为可空列，实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），写 null 时用本类型描述 */
type AccountLogWriteValues = Omit<
  Partial<AccountLogEntity>,
  'packageId' | 'memberDays' | 'relatedId'
> & {
  packageId?: number | null;
  memberDays?: number | null;
  relatedId?: number | null;
};

@Injectable()
export class UserBalanceService {
  constructor(
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
    @InjectRepository(AccountLogEntity)
    private readonly accountLogEntity: Repository<AccountLogEntity>,
    @InjectRepository(PackageEntity)
    private readonly packageEntity: Repository<PackageEntity>,
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
    private readonly dataSource: DataSource,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  private isActiveMembership(balance: Pick<UserBalanceEntity, 'packageId' | 'expirationTime'>) {
    if (!balance?.packageId || !balance.expirationTime) return false;
    return new Date(balance.expirationTime) > new Date();
  }

  private getMembershipBaseTime(expirationTime?: Date | string | null) {
    const expiration = expirationTime ? new Date(expirationTime) : null;
    return expiration && expiration > new Date() ? dayjs(expiration) : dayjs();
  }

  private getPackageDisplayName(pkg: Pick<PackageEntity, 'name' | 'planName' | 'variantName'>) {
    return [pkg.planName, pkg.variantName].filter(Boolean).join(' ').trim() || pkg.name || '';
  }

  /* 新注册用户赠送消费 */
  async addBalanceToNewUser(userId: number) {
    const existing = await this.userBalanceEntity.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }

    try {
      const registerConfigs = await this.configEntity.find({
        where: {
          configKey: In([
            'registerSendStatus', // 开启注册赠送
            'registerSendCredits', // 注册赠送积分数量
          ]),
        },
      });
      const configMap: any = registerConfigs.reduce<Record<string, number>>((pre, cur: any) => {
        const num = Number(cur.configVal);
        const n = Number.isInteger(num) && num > 0 ? num : 0;
        pre[cur.configKey] = n;
        return pre;
      }, {});
      let credits = 0;

      /* 开启注册赠送 */
      if (configMap.registerSendStatus === 1) {
        credits = configMap.registerSendCredits || 0;
      }

      /* 注册赠送日志 */
      await this.saveRecordRechargeLog({
        userId,
        rechargeType: RechargeType.REG_GIFT,
        credits,
      });

      try {
        /* 注册用户领取额度 */
        return await this.userBalanceEntity.save({ userId, credits });
      } catch (saveError) {
        if (saveError.code === 'ER_DUP_ENTRY') {
          return await this.userBalanceEntity.findOne({ where: { userId } });
        }
        throw saveError;
      }
    } catch (error) {
      // 只记安全摘要：数据库错误的消息可能带用户数据
      Logger.error('注册赠送额度失败', getSafeErrorSummary(error), 'UserBalanceService');
      throw new HttpException('注册赠送失败,请联系管理员！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 检查余额 */
  async validateBalance(
    req: { user: BillingActor },
    _type: number | null,
    amount: number,
    idempotencyKey?: string,
  ) {
    // 访客在下面提前返回；登录用户的 id 是数字主键（BillingActor.id 为 number | string 联合）
    const { id: userId, role } = req.user as { id: number; role?: string };

    // 访客用户直接使用访客余额验证
    if (role === 'visitor') {
      return this.validateVisitorBalance(req, amount, idempotencyKey);
    }

    const balance =
      (await this.userBalanceEntity.findOne({ where: { userId } })) ??
      (await this.createBaseUserBalance(userId));

    const isMemberActive = this.isActiveMembership(balance);
    const availableCredits =
      Number(balance.credits || 0) + (isMemberActive ? Number(balance.memberCredits || 0) : 0);

    if (availableCredits < amount) {
      throw new HttpException(
        `积分不足，继续体验服务，请按需选购套餐！`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return balance;
  }

  /* 检查游客的余额 */
  async validateVisitorBalance(
    req: { user: BillingActor },
    amount: number,
    idempotencyKey?: string,
  ) {
    const { id } = req.user;
    const creditsToUse = Math.ceil(Number(amount) || 0);
    if (creditsToUse <= 0) return true;

    /* 判断余额 */
    const visitorCreditsNum = await this.globalConfigService.getConfigs(['visitorCreditsNum']);

    const visitorCredits = visitorCreditsNum ? Number(visitorCreditsNum) : 0;

    /* 如果访客限额为0，说明未开启访客模式 */
    if (visitorCredits <= 0) {
      throw new HttpException(`访客模式未开启，请先登录后使用！`, HttpStatus.UNAUTHORIZED);
    }

    if (!this.redisClient?.incrBy) {
      throw new HttpException(
        `访客额度服务不可用，请先登录后使用！`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const key = this.getVisitorCreditsRedisKey(id);
    let usedCredits = 0;
    try {
      if (/^[a-f0-9]{64}$/u.test(String(idempotencyKey || ''))) {
        const ttlSeconds = this.getVisitorCreditsTtlSeconds();
        const marker = createHash('sha256')
          .update(`${String(id)}\u0000${idempotencyKey}`, 'utf8')
          .digest('hex');
        const result = await this.redisClient.eval(
          `
          local previous = redis.call('GET', KEYS[2])
          if previous then
            return tonumber(previous)
          end
          local current = redis.call('INCRBY', KEYS[1], ARGV[1])
          if current == tonumber(ARGV[1]) then
            redis.call('EXPIRE', KEYS[1], ARGV[3])
          end
          if current > tonumber(ARGV[2]) then
            redis.call('DECRBY', KEYS[1], ARGV[1])
            redis.call('SET', KEYS[2], '0', 'EX', ARGV[3])
            return 0
          end
          redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
          return 1
          `,
          {
            keys: [key, `visitor:credits:submission:${marker}`],
            arguments: [String(creditsToUse), String(visitorCredits), String(ttlSeconds)],
          },
        );
        if (Number(result) === 1) return true;
        if (Number(result) === 0) {
          throw new HttpException(
            `今日体验额度使用完毕，请注册使用完整服务！`,
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
        throw new Error('Visitor credit reservation returned an invalid result');
      }
      usedCredits = await this.redisClient.incrBy(key, creditsToUse);
      if (usedCredits === creditsToUse) {
        await this.redisClient.expire(key, this.getVisitorCreditsTtlSeconds());
      }

      if (usedCredits > visitorCredits) {
        await this.rollbackVisitorCredits(key, creditsToUse);
        throw new HttpException(
          `今日体验额度使用完毕，请注册使用完整服务！`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error(
        `访客额度扣减失败: ${error.message}`,
        getErrorStack(error),
        'UserBalanceService',
      );
      throw new HttpException(
        `访客额度服务不可用，请先登录后使用！`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private getVisitorCreditsRedisKey(fingerprint: string | number) {
    return `visitor:credits:${String(fingerprint)}:${dayjs().format('YYYY-MM-DD')}`;
  }

  private getVisitorCreditsTtlSeconds() {
    const now = dayjs();
    const secondsUntilTomorrow = now.add(1, 'day').startOf('day').diff(now, 'second');
    return Math.max(secondsUntilTomorrow + 3600, 3600);
  }

  private async rollbackVisitorCredits(key: string, amount: number) {
    try {
      await this.redisClient.decrBy(key, amount);
    } catch (error) {
      Logger.error(
        `访客额度回滚失败: ${error.message}`,
        getErrorStack(error),
        'UserBalanceService',
      );
    }
  }

  private isDuplicateEntryError(error: any) {
    return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
  }

  private async refundDeductLogWithSingleRetry(deductLogId: number, reason: string) {
    let firstError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result: any = await this.refundBalanceByLogId(deductLogId, reason);
        if (result?.refunded || result?.alreadyRefunded) return result;
        throw new Error(`chat_turn_refund_incomplete:${result?.reason || 'unknown'}`);
      } catch (error) {
        if (attempt === 1) throw error;
        firstError = error;
        Logger.warn(
          `轮次退款首次失败，将重试一次 - logId: ${deductLogId}`,
          'UserBalanceService-refundChatTurnCharges',
        );
      }
    }
    throw firstError;
  }

  async deductFromBalance(
    userId: number,
    _deductionType: number | null,
    amount: number,
    useTokens = 0,
    relatedId: number | null = null,
    chatType: number = 1,
    idempotencyMarker?: string,
    options: { allowOverdraft?: boolean } = {},
  ): Promise<number | null> {
    Logger.log(
      `deductFromBalance 调用 - 用户ID: ${userId}, 扣除积分: ${amount}, 使用Token: ${useTokens}, 关联ID: ${relatedId}, 聊天类型: ${chatType}`,
      'UserBalanceService-deductFromBalance',
    );

    // 访客用户不需要扣除余额，因为已经在validateBalance中处理
    if (!userId || userId === null) {
      return null;
    }

    return await this.dataSource.transaction(async manager => {
      const userBalanceRepository = manager.getRepository(UserBalanceEntity);
      const accountLogRepository = manager.getRepository(AccountLogEntity);
      const b = await userBalanceRepository.findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!b) {
        throw new HttpException('缺失当前用户账户记录！', HttpStatus.BAD_REQUEST);
      }

      const deductAmount = Number(amount) || 0;
      const chatTypeToRechargeTypeMap: Record<number, number> = {
        1: RechargeType.CHAT_DEDUCT,
        2: RechargeType.TOOL_DEDUCT,
      };
      const rechargeType = chatTypeToRechargeTypeMap[chatType] || RechargeType.TOOL_DEDUCT;
      const normalizedMarker = String(idempotencyMarker || '').trim();
      if (normalizedMarker) {
        if (!/^[a-z0-9:_-]{1,64}$/i.test(normalizedMarker) || !relatedId) {
          throw new HttpException('扣费幂等标识不合法', HttpStatus.BAD_REQUEST);
        }
        const existingLog = await accountLogRepository.findOne({
          where: {
            userId,
            rechargeType,
            relatedId,
            extent: normalizedMarker,
          },
          order: { id: 'DESC' },
        });
        if (existingLog) return existingLog.id;
      }
      const isMemberActive = this.isActiveMembership(b);
      const usableMemberCredits = isMemberActive ? Number(b.memberCredits || 0) : 0;
      const ordinaryCredits = Number(b.credits || 0);
      const availableCredits = usableMemberCredits + ordinaryCredits;

      if (deductAmount <= 0) {
        return null;
      }
      if (availableCredits < deductAmount) {
        // 对话结算发生在用量产生之后：余额不够也按实际用量扣，差额记在普通积分上（可为负），
        // 预检会拦住余额不足的下一次对话；其他扣费仍按余额不足拒绝
        if (!options.allowOverdraft) {
          throw new HttpException(
            `积分不足，继续体验服务，请按需选购套餐！`,
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
        Logger.log(
          `结算超出可用积分，差额记为欠费 - 用户ID: ${userId}, 可用积分: ${availableCredits}, 扣除积分: ${deductAmount}`,
          'UserBalanceService-deductFromBalance',
        );
      }

      // 计算需要扣除的余额，优先扣有效会员积分，不够再扣普通积分
      let remainingAmount = deductAmount;
      const memberDeducted = Math.min(Math.max(0, usableMemberCredits), remainingAmount);
      remainingAmount -= memberDeducted;
      const nonMemberDeducted = remainingAmount;

      const updateSet: Record<string, any> = {
        // 列允许为 NULL：按 0 参与运算，否则 NULL - 金额仍是 NULL，透支的欠款会丢失
        usedTokens: () => `COALESCE(usedTokens, 0) + ${Number(useTokens) || 0}`,
        usedCredits: () => `COALESCE(usedCredits, 0) + ${deductAmount}`,
      };
      if (memberDeducted > 0) {
        updateSet.memberCredits = () => `COALESCE(memberCredits, 0) - ${memberDeducted}`;
      }
      if (nonMemberDeducted > 0) {
        updateSet.credits = () => `COALESCE(credits, 0) - ${nonMemberDeducted}`;
      }

      const result = await userBalanceRepository.update({ userId }, updateSet);

      if (result.affected === 0) {
        throw new HttpException('消费余额失败！', HttpStatus.BAD_REQUEST);
      }

      const tokenUsedValue = useTokens > 0 ? useTokens : null;
      Logger.log(
        `记录消费日志 - 用户ID: ${userId}, 使用Token: ${useTokens}, 保存tokenUsed: ${tokenUsedValue}, 扣除积分: ${amount}, 关联ID: ${relatedId}`,
        'UserBalanceService-deductFromBalance',
      );

      const logData: any = {
        userId,
        rechargeType,
        credits: deductAmount,
        days: -1,
        uid: createRandomUid(),
        relatedId,
        memberCredits: memberDeducted,
        extent: normalizedMarker || null,
        tokenUsed: tokenUsedValue,
      };

      const savedLog = await accountLogRepository.save(logData);
      return savedLog.id;
    });
  }

  /* 查询用户余额 */
  async queryUserBalance(userId?: number | null): Promise<UserBalanceSummary | undefined> {
    // 访客用户返回默认余额信息
    if (!userId || userId === null) {
      return {
        packageId: null,
        packageWeight: 0,
        packageName: '',
        credits: 0,
        memberCredits: 0,
        usedCredits: 0,
        usedTokens: 0,
        expirationTime: null,
        sumCredits: 0,
        isMember: false,
      };
    }

    try {
      const res: any = await this.userBalanceEntity.findOne({
        where: { userId },
        select: {
          packageId: true,
          credits: true,
          memberCredits: true,
          usedCredits: true,
          usedTokens: true,
          expirationTime: true,
        },
      });
      if (!res) {
        // createBaseUserBalance 失败时自行抛出 409，这里不再需要空值分支
        await this.createBaseUserBalance(userId);
        return await this.queryUserBalance(userId);
      }
      const isMember = this.isActiveMembership(res);
      let packageWeight = 0;
      let packageName = '';
      if (isMember && res.packageId) {
        const pkg = await this.packageEntity.findOne({
          where: { id: res.packageId },
          select: { id: true, name: true, planName: true, weight: true },
        });
        packageWeight = Number(pkg?.weight || 0);
        packageName = pkg?.planName || pkg?.name || '';
      }
      res.sumCredits = isMember
        ? Number(res.credits || 0) + Number(res.memberCredits || 0)
        : Number(res.credits || 0);
      res.expirationTime = res.expirationTime ? formatDate(res.expirationTime, 'YYYY-MM-DD') : null;
      res.isMember = isMember;
      res.packageWeight = packageWeight;
      res.packageName = packageName;
      return res;
    } catch (error) {
      Logger.error(
        `查询余额信息失败: ${error.message}`,
        getErrorStack(error),
        'UserBalanceService',
      );
    }
  }

  /* 记录充值日志 */
  async saveRecordRechargeLog(logInfo: LogInfo, manager?: EntityManager) {
    const {
      userId,
      rechargeType,
      credits = 0,
      days = -1,
      pkgName = '',
      extent = '',
      packageId = null,
      memberDays = null,
    } = logInfo;
    if (!userId) {
      throw new HttpException('当前用户不存在,记录充值日志异常', HttpStatus.BAD_REQUEST);
    }
    const uid = createRandomUid();
    const accountLogRepository = manager
      ? manager.getRepository(AccountLogEntity)
      : this.accountLogEntity;
    const values: AccountLogWriteValues = {
      userId,
      rechargeType,
      credits,
      days,
      extent,
      uid,
      pkgName,
      packageId,
      memberDays,
    };
    // 可空列写 null：实体属性未标 | null，在仓库边界收口
    return await accountLogRepository.save(values as DeepPartial<AccountLogEntity>);
  }

  /* 创建一条基础的用户余额记录 */
  async createBaseUserBalance(
    userId: number,
    userBalanceInfo: UserBalanceInfo = {},
    manager?: EntityManager,
  ): Promise<UserBalanceEntity> {
    const { credits = 0 } = userBalanceInfo;
    const userBalanceRepository = manager
      ? manager.getRepository(UserBalanceEntity)
      : this.userBalanceEntity;

    const existing = await userBalanceRepository.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }

    try {
      return await userBalanceRepository.save({ userId, credits });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        // 并发创建撞唯一键：改读对方写入的记录；读不到说明又被并发删除，明确报错而不是把 null 透传给调用方
        const concurrent = await userBalanceRepository.findOne({ where: { userId } });
        if (!concurrent) {
          throw new HttpException('用户账户初始化冲突，请稍后重试！', HttpStatus.CONFLICT);
        }
        return concurrent;
      }
      throw error;
    }
  }

  /* 给用户增加固定次数额度 */
  async addBalanceToUser(
    userId: number,
    balance: BalanceGrant,
    days = -1,
    manager?: EntityManager,
  ) {
    try {
      const numericUserId = Number(userId);
      const grantDays = Number(days ?? -1);
      const grantCredits = Number(balance?.credits ?? 0);
      if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        throw new HttpException('用户ID无效！', HttpStatus.BAD_REQUEST);
      }
      if (!Number.isFinite(grantDays)) {
        throw new HttpException('充值天数无效！', HttpStatus.BAD_REQUEST);
      }
      if (!Number.isFinite(grantCredits) || grantCredits < 0) {
        throw new HttpException('充值积分无效！', HttpStatus.BAD_REQUEST);
      }

      const userBalanceRepository = manager
        ? manager.getRepository(UserBalanceEntity)
        : this.userBalanceEntity;
      const packageRepository = manager ? manager.getRepository(PackageEntity) : this.packageEntity;

      /* 使用悲观锁读取用户余额，防止并发读写丢失 */
      let userBalanceInfo: UserBalanceEntity | null | undefined;
      if (manager) {
        userBalanceInfo = await manager
          .getRepository(UserBalanceEntity)
          .findOne({ where: { userId: numericUserId }, lock: { mode: 'pessimistic_write' } });
      }
      if (!userBalanceInfo) {
        userBalanceInfo =
          (await userBalanceRepository.findOne({ where: { userId: numericUserId } })) ||
          (await this.createBaseUserBalance(numericUserId, {}, manager));
      }
      if (!userBalanceInfo) {
        throw new HttpException('查询用户账户信息失败！', HttpStatus.BAD_REQUEST);
      }
      /* 所有更新参数统一收集，最后一次 update 提交 */
      const updateParams: Record<string, any> = {};

      /* 是否充值会员套餐 大于0的时间天数都属于套餐 */
      if (grantDays > 0) {
        const { packageId } = balance;
        if (!packageId) {
          throw new HttpException('缺失当前套餐ID、充值失败！', HttpStatus.BAD_REQUEST);
        }

        const rawSnapshotWeight = balance.weight ?? balance.weightSnapshot;
        const snapshotWeight =
          rawSnapshotWeight === undefined || rawSnapshotWeight === null
            ? NaN
            : Number(rawSnapshotWeight);
        let weight = Number.isFinite(snapshotWeight) ? snapshotWeight : null;
        if (weight === null) {
          const pkgInfo = await packageRepository.findOne({
            where: { id: packageId },
            select: { id: true, weight: true },
          });
          if (!pkgInfo) {
            throw new HttpException('当前套餐不存在！', HttpStatus.BAD_REQUEST);
          }
          weight = Number(pkgInfo.weight || 0);
        }
        const isActiveMember = this.isActiveMembership(userBalanceInfo);

        /* 过期会员按新会员处理，不能沿用旧的过期有效期或旧会员额度 */
        if (!isActiveMember) {
          updateParams.memberCredits = grantCredits;
          updateParams.expirationTime = this.getMembershipBaseTime()
            .add(grantDays, 'day')
            .format('YYYY-MM-DD HH:mm:ss');
          updateParams.packageId = packageId;
        } else {
          /* 同等级续期；更高等级升级从当前时间重新计算，避免低等级剩余时长被提升为高等级时长。 */
          const curPackageInfo = await packageRepository.findOne({
            where: { id: userBalanceInfo.packageId },
            select: { id: true, weight: true },
          });
          const currentWeight = Number(curPackageInfo?.weight || 0);
          if (!curPackageInfo || weight === currentWeight) {
            updateParams.memberCredits = () => `COALESCE(memberCredits, 0) + ${grantCredits}`;
            updateParams.expirationTime = this.getMembershipBaseTime(userBalanceInfo.expirationTime)
              .add(grantDays, 'day')
              .format('YYYY-MM-DD HH:mm:ss');
            updateParams.packageId = packageId;
          }
          if (weight > currentWeight) {
            updateParams.memberCredits = () => `COALESCE(memberCredits, 0) + ${grantCredits}`;
            updateParams.expirationTime = this.getMembershipBaseTime()
              .add(grantDays, 'day')
              .format('YYYY-MM-DD HH:mm:ss');
            updateParams.packageId = packageId;
          }
          if (weight < currentWeight) {
            updateParams.memberCredits = () => `COALESCE(memberCredits, 0) + ${grantCredits}`;
          }
        }
      }

      /* 充值不限时卡直接叠加 */
      if (grantDays <= 0) {
        updateParams.credits = () => `COALESCE(credits, 0) + ${grantCredits}`;
      }

      /* 使用事务内 repository 执行 update，确保在同一个事务/连接中 */
      const result = await userBalanceRepository.update({ userId: numericUserId }, updateParams);
      if (result.affected === 0) {
        throw new HttpException(`${numericUserId}充值失败`, HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      Logger.error(`用户充值失败: ${error.message}`, getErrorStack(error), 'UserBalanceService');
      throw new HttpException('用户充值失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 管理员扣减用户普通积分（不动会员积分），余额不足时报错 */
  async reduceBalanceFromUser(userId: number, amount: number, manager: EntityManager) {
    const numericUserId = Number(userId);
    const reduceAmount = Number(amount);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw new HttpException('用户ID无效！', HttpStatus.BAD_REQUEST);
    }
    if (!Number.isInteger(reduceAmount) || reduceAmount <= 0) {
      throw new HttpException('扣减积分数量无效！', HttpStatus.BAD_REQUEST);
    }

    const userBalanceRepository = manager.getRepository(UserBalanceEntity);
    const balance = await userBalanceRepository.findOne({
      where: { userId: numericUserId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!balance) {
      throw new HttpException('缺失当前用户账户记录！', HttpStatus.BAD_REQUEST);
    }

    const ordinaryCredits = Number(balance.credits || 0);
    if (ordinaryCredits < reduceAmount) {
      throw new HttpException(
        `用户普通积分不足（当前 ${ordinaryCredits}），无法扣减 ${reduceAmount}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await userBalanceRepository.update(
      { userId: numericUserId },
      { credits: () => `credits - ${reduceAmount}` },
    );
    if (result.affected === 0) {
      throw new HttpException('扣减积分失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 管理员赠送会员套餐 */
  async grantPackageToUser(userId: number, packageId: number) {
    try {
      return await this.dataSource.transaction(async manager => {
        const userRepository = manager.getRepository(UserEntity);
        const packageRepository = manager.getRepository(PackageEntity);

        const user = await userRepository.findOne({
          where: { id: userId },
          select: { id: true },
        });
        if (!user) {
          throw new HttpException('当前用户不存在！', HttpStatus.BAD_REQUEST);
        }

        const pkg = await packageRepository.findOne({
          where: { id: packageId, status: 1 },
          select: {
            id: true,
            name: true,
            planName: true,
            variantName: true,
            planType: true,
            days: true,
            credits: true,
            weight: true,
          },
        });
        if (!pkg) {
          throw new HttpException('当前套餐不存在或未启用！', HttpStatus.BAD_REQUEST);
        }

        if (pkg.planType !== 'membership') {
          throw new HttpException('请选择会员套餐进行赠送！', HttpStatus.BAD_REQUEST);
        }

        const days = Number(pkg.days || 0);
        if (days <= 0) {
          throw new HttpException('会员套餐有效期配置异常！', HttpStatus.BAD_REQUEST);
        }

        const credits = Number(pkg.credits || 0);
        await this.addBalanceToUser(
          userId,
          {
            packageId: pkg.id,
            credits,
            weightSnapshot: Number(pkg.weight || 0),
          },
          days,
          manager,
        );

        const savedLog = await this.saveRecordRechargeLog(
          {
            userId,
            rechargeType: RechargeType.ADMIN_GIFT,
            credits,
            days,
            pkgName: this.getPackageDisplayName(pkg),
            packageId: pkg.id,
            memberDays: days,
            extent: '管理员赠送套餐',
          },
          manager,
        );

        Logger.log(
          `管理员赠送套餐成功 - 用户ID: ${userId}, 套餐ID: ${packageId}`,
          'UserBalanceService-grantPackageToUser',
        );
        return savedLog;
      });
    } catch (error) {
      Logger.error(
        `管理员赠送套餐失败: ${error.message}`,
        getErrorStack(error),
        'UserBalanceService-grantPackageToUser',
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('赠送套餐失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 支付成功给用户充值套餐 */
  async addBalanceToOrder(order: Partial<OrderEntity>, manager?: EntityManager) {
    // 订单 userId 列可空且无外键约束：孤儿订单绝不能入账到任何用户，先于任何余额读写显式拒绝
    const orderUserId = order?.userId;
    if (typeof orderUserId !== 'number' || !Number.isInteger(orderUserId) || orderUserId <= 0) {
      Logger.error(
        `订单充值被拒绝: 订单 ...${String(order?.orderId ?? '').slice(-4)} 缺少归属用户`,
        'UserBalanceService',
      );
      throw new HttpException('订单缺少归属用户，无法入账！', HttpStatus.BAD_REQUEST);
    }

    try {
      const { count = 1 } = order;

      /* 使用订单快照发货，不依赖套餐当前状态 */
      const { creditsSnapshot, daysSnapshot, pkgNameSnapshot } = order;

      if (creditsSnapshot == null || daysSnapshot == null) {
        throw new HttpException('订单缺少套餐快照信息！', HttpStatus.BAD_REQUEST);
      }

      const credits = creditsSnapshot;
      const days = daysSnapshot;
      const pkgName = pkgNameSnapshot;

      const creditsToGrant = (credits || 0) * count;
      const daysToGrant = (days || 0) * count;
      const money = {
        credits: creditsToGrant,
        days: daysToGrant,
        packageId: order.goodsId,
        weightSnapshot: order.weightSnapshot,
      };
      /* 充值进账户 */
      await this.addBalanceToUser(orderUserId, money, daysToGrant, manager);
      /* 记录充值日志 */
      await this.saveRecordRechargeLog(
        {
          userId: orderUserId,
          rechargeType: RechargeType.SCAN_PAY,
          credits: creditsToGrant,
          pkgName,
          days: daysToGrant,
          packageId: order.goodsId,
          memberDays: daysToGrant > 0 ? daysToGrant : null,
        },
        manager,
      );
    } catch (error) {
      Logger.error(`订单充值失败: ${error.message}`, getErrorStack(error), 'UserBalanceService');
      throw new HttpException('充值失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询用户充值日志 */
  async getRechargeLog(req: Request, params: { page?: number; size?: number }) {
    const { page = 1, size = 20 } = params;
    // 访客没有充值记录（userId 是数字列，不能拿 visitorId 去查）
    if (requireRequestUser(req).role === 'visitor') {
      return { rows: [], count: 0 };
    }
    const { id } = requireRegisteredUser(req);
    const [rows, count] = await this.accountLogEntity.findAndCount({
      where: { userId: id },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    // 不再设置 expireDateCn，由前端根据 days 字段进行多语言处理
    return { rows: formatCreateOrUpdateDate(rows), count };
  }

  /* 管理端查询用户账户变更记录 */
  async getAccountLog(req: Request, params: AccountLogQuery) {
    try {
      const { page = 1, size = 10, userId, rechargeType, packageId } = params;
      requireRequestUser(req);

      let queryBuilder = this.accountLogEntity
        .createQueryBuilder('accountLog')
        .leftJoinAndSelect('accountLog.user', 'user')
        .orderBy('accountLog.id', 'DESC')
        .skip((page - 1) * size)
        .take(size);

      const conditions = [];

      if (rechargeType) {
        conditions.push('accountLog.rechargeType = :rechargeType');
        queryBuilder.setParameter('rechargeType', rechargeType);
      }

      if (userId) {
        conditions.push('accountLog.userId = :userId');
        queryBuilder.setParameter('userId', userId);
      }

      if (packageId) {
        conditions.push('accountLog.packageId LIKE :packageId');
        queryBuilder.setParameter('packageId', `%${packageId}%`);
      }

      if (conditions.length > 0) {
        queryBuilder.where(conditions.join(' AND '));
      }

      const [accountLogs, count] = await queryBuilder.getManyAndCount();

      const rows = accountLogs.map((item: any) => {
        const user = item.user || {};
        return {
          ...item,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
        };
      });

      return { rows, count };
    } catch (error) {
      Logger.error(
        `查询用户账户失败: ${error.message}`,
        getErrorStack(error),
        'UserBalanceService',
      );
      throw new HttpException('查询用户账户失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过用户id批量查询用户 */
  async queryUserBalanceByIds(ids: number[]) {
    return await this.userBalanceEntity.find({ where: { userId: In(ids) } });
  }

  /** 对一个助手轮次的基础费与工具费执行幂等退款。 */
  async refundChatTurnCharges(
    assistantLogId: number,
    reason: string = '对话失败退款',
  ): Promise<Array<unknown>> {
    if (!assistantLogId) return [];
    try {
      const deductLogs = await this.accountLogEntity.find({
        where: {
          relatedId: assistantLogId,
          rechargeType: In([RechargeType.CHAT_DEDUCT, RechargeType.TOOL_DEDUCT]),
        },
        order: { id: 'ASC' },
      });
      const results: Array<unknown> = [];
      for (const log of deductLogs) {
        results.push(await this.refundDeductLogWithSingleRetry(log.id, reason));
      }
      return results;
    } catch (error) {
      Logger.error(
        `轮次退款失败: ${error.message}`,
        getErrorStack(error),
        'UserBalanceService-refundChatTurnCharges',
      );
      throw error;
    }
  }

  /**
   * 启动时收敛“终态已提交、退款尚未完成”的 P8 对话扣费。
   * 只处理新幂等 marker、注册用户、失败轮次或带 Platform 恢复来源的中断轮次；
   * 成功轮、用户主动取消、visitor 与旧扣费记录不会进入候选集。
   */
  async reconcileTerminalChatTurnRefunds(
    reason: string = '失败或中断终态补偿退款',
  ): Promise<{ candidates: number; refunded: number; alreadyRefunded: number }> {
    let candidates = 0;
    let refunded = 0;
    let alreadyRefunded = 0;

    for (;;) {
      const rows = await this.accountLogEntity
        .createQueryBuilder('deduct')
        .select('deduct.id', 'deductLogId')
        .innerJoin(
          ChatLogEntity,
          'assistant',
          'assistant.id = deduct.relatedId AND assistant.userId = deduct.userId',
        )
        .leftJoin(
          AccountLogEntity,
          'refund',
          'refund.refundSourceLogId = deduct.id AND refund.rechargeType = :refundType',
          { refundType: RechargeType.REFUND },
        )
        .where('deduct.rechargeType IN (:...deductTypes)', {
          deductTypes: [RechargeType.CHAT_DEDUCT, RechargeType.TOOL_DEDUCT],
        })
        .andWhere('deduct.extent IN (:...markers)', {
          markers: [...CHAT_TURN_CHARGE_MARKERS],
        })
        .andWhere('deduct.userId IS NOT NULL')
        .andWhere('assistant.direction = :assistantDirection', {
          assistantDirection: 'out',
        })
        .andWhere(
          `(assistant.status = :failedStatus OR (
            assistant.status = :stoppedStatus
            AND JSON_VALID(assistant.message) = 1
            AND JSON_UNQUOTE(JSON_EXTRACT(
              assistant.message,
              '$.internal.chatTurnTerminalOrigin'
            )) = :systemRecoveryOrigin
          ))`,
          {
            failedStatus: ChatLogStatus.FAILED,
            stoppedStatus: ChatLogStatus.STOPPED,
            systemRecoveryOrigin: CHAT_TURN_SYSTEM_RECOVERY_ORIGIN,
          },
        )
        .andWhere('refund.id IS NULL')
        .orderBy('deduct.id', 'ASC')
        .limit(CHAT_TURN_REFUND_BATCH_SIZE)
        .getRawMany<{ deductLogId: number | string }>();

      if (!rows.length) break;
      candidates += rows.length;
      for (const row of rows) {
        const deductLogId = Number(row.deductLogId);
        if (!Number.isInteger(deductLogId) || deductLogId <= 0) {
          throw new Error('chat_turn_refund_candidate_invalid');
        }
        const result: any = await this.refundDeductLogWithSingleRetry(deductLogId, reason);
        if (result.refunded) refunded += 1;
        if (result.alreadyRefunded) alreadyRefunded += 1;
      }
    }

    if (candidates) {
      Logger.log(
        `终态退款收敛完成: candidates=${candidates}, refunded=${refunded}, alreadyRefunded=${alreadyRefunded}`,
        'UserBalanceService-reconcileTerminalChatTurnRefunds',
      );
    }
    return { candidates, refunded, alreadyRefunded };
  }

  /**
   * 通过扣费记录ID退还积分（内部方法）
   */
  async refundBalanceByLogId(deductLogId: number, reason: string = '任务失败退款') {
    if (!deductLogId) {
      Logger.warn('未提供扣费记录ID，跳过退款', 'UserBalanceService-refundBalance');
      return;
    }

    try {
      return await this.dataSource.transaction(async manager => {
        const accountLogRepository = manager.getRepository(AccountLogEntity);
        const userBalanceRepository = manager.getRepository(UserBalanceEntity);

        const deductLog = await accountLogRepository.findOne({
          where: { id: deductLogId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!deductLog) {
          Logger.warn(
            `未找到扣费记录 - logId: ${deductLogId}，跳过退款`,
            'UserBalanceService-refundBalance',
          );
          return { refunded: false, reason: 'missing_log' };
        }

        if (
          ![RechargeType.CHAT_DEDUCT, RechargeType.TOOL_DEDUCT].includes(deductLog.rechargeType)
        ) {
          Logger.warn(
            `扣费记录 ${deductLogId} 类型不可退款: ${deductLog.rechargeType}`,
            'UserBalanceService-refundBalance',
          );
          return { refunded: false, reason: 'not_refundable_type' };
        }

        const existingRefund = await accountLogRepository.findOne({
          where: {
            rechargeType: RechargeType.REFUND,
            refundSourceLogId: deductLogId,
          },
        });
        if (existingRefund) {
          Logger.log(
            `扣费记录已退款，跳过重复退款 - logId: ${deductLogId}`,
            'UserBalanceService-refundBalance',
          );
          return { refunded: false, alreadyRefunded: true };
        }

        const { userId, credits, memberCredits: refundMemberCredits, relatedId } = deductLog;

        if (!userId || userId === null) {
          Logger.warn('扣费记录关联的是访客用户，跳过退款', 'UserBalanceService-refundBalance');
          return { refunded: false, reason: 'visitor_log' };
        }

        const userBalance = await userBalanceRepository.findOne({
          where: { userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!userBalance) {
          Logger.warn(
            `用户 ${userId} 余额记录不存在，跳过退款`,
            'UserBalanceService-refundBalance',
          );
          return { refunded: false, reason: 'missing_balance' };
        }

        Logger.log(
          `找到扣费记录 - 用户ID: ${userId}, logId: ${deductLogId}, 总扣费: ${credits}, 会员: ${refundMemberCredits}`,
          'UserBalanceService-refundBalance',
        );

        const refundNonMemberCredits = Number(credits || 0) - Number(refundMemberCredits || 0);
        const refundMemberCreditsValue = Number(refundMemberCredits || 0);

        const updateSet: Record<string, any> = {};
        if (refundMemberCreditsValue > 0) {
          updateSet.memberCredits = () =>
            `COALESCE(memberCredits, 0) + ${refundMemberCreditsValue}`;
        }
        if (refundNonMemberCredits > 0) {
          updateSet.credits = () => `COALESCE(credits, 0) + ${refundNonMemberCredits}`;
        }

        if (Object.keys(updateSet).length === 0) {
          Logger.warn(
            `扣费记录 ${deductLogId} 没有可退款的内容`,
            'UserBalanceService-refundBalance',
          );
          return { refunded: false, reason: 'empty_refund' };
        }

        const result = await userBalanceRepository.update({ userId }, updateSet);

        if (result.affected === 0) {
          Logger.warn(`用户 ${userId} 退款更新失败`, 'UserBalanceService-refundBalance');
          return { refunded: false, reason: 'update_failed' };
        }

        const logData: any = {
          userId,
          rechargeType: RechargeType.REFUND,
          credits: credits || 0,
          memberCredits: refundMemberCreditsValue,
          days: -1,
          uid: createRandomUid(),
          relatedId,
          refundSourceLogId: deductLogId,
          extent: reason,
        };

        await accountLogRepository.save(logData);
        Logger.log(
          `退款成功 - 用户ID: ${userId}, logId: ${deductLogId}, 原因: ${reason}`,
          'UserBalanceService-refundBalance',
        );
        return { refunded: true };
      });
    } catch (error) {
      if (this.isDuplicateEntryError(error)) {
        Logger.log(
          `扣费记录已由并发请求完成退款，跳过重复退款 - logId: ${deductLogId}`,
          'UserBalanceService-refundBalance',
        );
        return { refunded: false, alreadyRefunded: true };
      }
      Logger.error(`退款失败: ${error.message}`, 'UserBalanceService-refundBalance');
      throw error;
    }
  }
}
