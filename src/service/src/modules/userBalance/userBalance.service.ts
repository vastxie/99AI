import { RechargeType } from '@/common/constants/balance.constant';
import { createRandomUid, hideString } from '@/common/utils';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { In, LessThan, Repository } from 'typeorm';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { GlobalConfigService } from './../globalConfig/globalConfig.service';
import { AccountLogEntity } from './accountLog.entity';
import { BalanceEntity } from './balance.entity';
import { UserBalanceEntity } from './userBalance.entity';
// import * as dayjs from 'dayjs';
import dayjs, {
  formatCreateOrUpdateDate,
  formatDate,
} from '@/common/utils/date';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { UserEntity } from '../user/user.entity';
import { FingerprintLogEntity } from './fingerprint.entity';

interface LogInfo {
  userId: number;
  rechargeType: number;
  model3Count?: number;
  model4Count?: number;
  drawMjCount?: number;
  days?: number;
  pkgName?: string;
  extent?: string;
}

interface UserBalanceInfo {
  model3Count?: number;
  model4Count?: number;
  drawMjCount?: number;
}

@Injectable()
export class UserBalanceService {
  constructor(
    @InjectRepository(BalanceEntity)
    private readonly balanceEntity: Repository<BalanceEntity>,
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
    @InjectRepository(AccountLogEntity)
    private readonly accountLogEntity: Repository<AccountLogEntity>,
    @InjectRepository(CramiPackageEntity)
    private readonly cramiPackageEntity: Repository<CramiPackageEntity>,
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    @InjectRepository(FingerprintLogEntity)
    private readonly fingerprintLogEntity: Repository<FingerprintLogEntity>,
    @InjectRepository(ChatGroupEntity)
    private readonly chatGroupEntity: Repository<ChatGroupEntity>,
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    private readonly globalConfigService: GlobalConfigService
  ) {}

  /* 新注册用户赠送消费 */
  async addBalanceToNewUser(userId: number) {
    try {
      // TODO 直接从globalConfig中获取配置
      const registerConfigs = await this.configEntity.find({
        where: {
          configKey: In([
            'registerSendStatus', // 开启注册赠送
            'registerSendModel3Count', // 注册赠送模型3聊天次数
            'registerSendModel4Count', // 注册赠送模型4聊天次数
            'registerSendDrawMjCount', // 注册赠送MJ绘画次数
            'firstRegisterSendStatus', // 开启优先注册赠送
            'firstRegisterSendRank', // 优先注册赠送名次
            'firstRregisterSendModel3Count', // 优先注册赠送模型3聊天次数
            'firstRregisterSendModel4Count', // 优先注册赠送模型4聊天次数
            'firstRregisterSendDrawMjCount', // 优先注册赠送MJ绘画次数
          ]),
        },
      });
      const configMap: any = registerConfigs.reduce((pre, cur: any) => {
        const num = Number(cur.configVal);
        const n = Number.isInteger(num) && num > 0 ? num : 0;
        pre[cur.configKey] = n;
        return pre;
      }, {});
      let model3Count = 0;
      let model4Count = 0;
      let drawMjCount = 0;

      /* 开启注册增送 */
      if (configMap.registerSendStatus === 1) {
        model3Count = model3Count + configMap.registerSendModel3Count;
        model4Count = model4Count + configMap.registerSendModel4Count;
        drawMjCount = drawMjCount + configMap.registerSendDrawMjCount;
      }

      /* 开启优先注册赠送并且在赠送范围内 */
      if (
        configMap.registerSendStatus === 1 &&
        configMap.firstRegisterSendStatus === 1 &&
        userId <= configMap.firstRegisterSendRank
      ) {
        model3Count = model3Count + configMap.firstRregisterSendModel3Count;
        model4Count = model4Count + configMap.firstRregisterSendModel4Count;
        drawMjCount = drawMjCount + configMap.firstRregisterSendDrawMjCount;
      }

      /* 受邀人注册赠送日志 */
      await this.saveRecordRechargeLog({
        userId,
        rechargeType: RechargeType.REG_GIFT,
        model3Count,
        drawMjCount,
        model4Count,
      });
      /* 受邀人初次注册 一次领取所有额度 */
      await this.userBalanceEntity.save({
        userId,
        model3Count,
        model4Count,
        drawMjCount,
        useTokens: 0,
      });
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException(
        '注册赠送失败,请联系管理员！',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /* 检查余额 */
  async validateBalance(req, type, amount) {
    const { id: userId, role } = req.user;
    let b = await this.userBalanceEntity.findOne({ where: { userId } });
    if (!b) {
      b = await this.createBaseUserBalance(userId);
    }
    if (role === 'visitor') {
      return this.validateVisitorBalance(req, type, amount);
    }
    /* 会员扣费key */
    const memberKey =
      type === 1
        ? 'memberModel3Count'
        : type === 2
        ? 'memberModel4Count'
        : type === 3
        ? 'memberDrawMjCount'
        : null;
    /* 非会员扣费key */
    const baseKey =
      type === 1
        ? 'model3Count'
        : type === 2
        ? 'model4Count'
        : type === 3
        ? 'drawMjCount'
        : null;

    // 打印到日志
    // Logger.debug(`操作类型type: ${type}`, 'ValidateBalance');
    // Logger.debug(`会员扣费key(memberKey): ${memberKey}`, 'ValidateBalance');
    // Logger.debug(`非会员扣费key(baseKey): ${baseKey}`, 'ValidateBalance');
    /* 如果是会员 */
    if (b.packageId && b[memberKey] + b[baseKey] < amount) {
      if (b[baseKey] < amount) {
        throw new HttpException(
          `积分不足，继续体验服务，请按需选购套餐！`,
          HttpStatus.PAYMENT_REQUIRED
        );
      }
    }
    /* 如果不是会员 */
    if (!b.packageId && b[baseKey] < amount) {
      throw new HttpException(
        `积分不足，继续体验服务，请按需选购套餐！`,
        HttpStatus.PAYMENT_REQUIRED
      );
    }
    return b;
  }

  /* 检查游客的余额 */
  async validateVisitorBalance(req, type, amount) {
    const { id } = req.user;
    const baseKey =
      type === 1
        ? 'model3Count'
        : type === 2
        ? 'model4Count'
        : type === 3
        ? 'drawMjCount'
        : null;
    const now = new Date();
    const log = await this.fingerprintLogEntity.findOne({
      where: { fingerprint: id },
    });
    /* 判断余额 */
    const { visitorModel3Num, visitorModel4Num, visitorMJNum } =
      await this.globalConfigService.getConfigs([
        'visitorModel3Num',
        'visitorModel4Num',
        'visitorMJNum',
      ]);
    const settings = {
      model3Count: visitorModel3Num ? Number(visitorModel3Num) : 0,
      model4Count: visitorModel4Num ? Number(visitorModel4Num) : 0,
      drawMjCount: visitorMJNum ? Number(visitorMJNum) : 0,
    };
    /* 如果没有 */
    if (!log) {
      let data = {
        fingerprint: id,
        model3Count: 0,
        model4Count: 0,
        drawMjCount: 0,
      };
      data[baseKey] = data[baseKey] + amount;
      /* 判断余额 */
      if (data[baseKey] > settings[baseKey]) {
        throw new HttpException(
          `今日体验额度使用完毕，请注册使用完整服务！`,
          HttpStatus.PAYMENT_REQUIRED
        );
      } else {
        await this.fingerprintLogEntity.save(data);
        return true;
      }
    } else {
      const { model3Count, model4Count, drawMjCount } = log;
      let data = {
        model3Count,
        model4Count,
        drawMjCount,
      };
      /* 判断是否是昨天 */
      // const isUpdateLastDay = this.isUpdatedToday(log.updatedAt)
      // const date = Number(new Date(log.updatedAt)) + 8 * 60 * 60 * 1000
      const date = Number(new Date(log.updatedAt));
      const isUpdateLastDay = this.isUpdatedToday(date);
      if (isUpdateLastDay) {
        data[baseKey] = data[baseKey] + amount;
      } else {
        data = {
          model3Count: 0,
          model4Count: 0,
          drawMjCount: 0,
        };
        data[baseKey] = data[baseKey] + amount;
      }
      if (data[baseKey] > settings[baseKey]) {
        throw new HttpException(
          `今日体验额度使用完毕，请注册使用完整服务！`,
          HttpStatus.PAYMENT_REQUIRED
        );
      } else {
        await this.fingerprintLogEntity.update({ fingerprint: id }, data);
        return true;
      }
    }
  }

  /* 判读上次更新是不是今天  */
  isUpdatedToday(date) {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    return date >= todayStart;
  }

  async deductFromBalance(userId, deductionType, amount, UseAmount = 0) {
    // 从数据库中查找特定用户的账户余额记录
    const b = await this.userBalanceEntity.findOne({ where: { userId } });

    // 如果没有找到用户账户记录，则抛出异常
    if (!b) {
      throw new HttpException('缺失当前用户账户记录！', HttpStatus.BAD_REQUEST);
    }

    // 确定会员和非会员账户的 keys
    const keys = {
      1: {
        member: 'memberModel3Count',
        nonMember: 'model3Count',
        token: 'useModel3Token',
      },
      2: {
        member: 'memberModel4Count',
        nonMember: 'model4Count',
        token: 'useModel4Token',
      },
      3: {
        member: 'memberDrawMjCount',
        nonMember: 'drawMjCount',
        token: 'useDrawMjToken',
      },
    };
    const { member, nonMember, token } = keys[deductionType];

    // 计算需要扣除的余额
    let remainingAmount = amount;
    let newMemberBalance = Math.max(b[member] - remainingAmount, 0);
    remainingAmount -= b[member] - newMemberBalance;
    let newNonMemberBalance = b[nonMember];
    if (remainingAmount > 0) {
      newNonMemberBalance = Math.max(b[nonMember] - remainingAmount, 0);
      remainingAmount -= b[nonMember] - newNonMemberBalance;
    }

    // 更新余额对象
    const updateBalance = {
      [member]: newMemberBalance,
      [nonMember]: newNonMemberBalance,
      [token]: (b[token] || 0) + UseAmount,
    };

    // 特定类型的额外处理（如记录使用次数）
    if (token === 'useModel3Token' || token === 'useModel4Token') {
      updateBalance[token.replace('Token', 'Count')] =
        (b[token.replace('Token', 'Count')] || 0) + amount;
    }

    // 更新数据库中的用户账户余额
    const result = await this.userBalanceEntity.update(
      { userId },
      updateBalance
    );

    // 如果没有记录被更新，则抛出异常
    if (result.affected === 0) {
      throw new HttpException('消费余额失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询用户余额 */
  async queryUserBalance(userId: number) {
    try {
      const res: any = await this.userBalanceEntity.findOne({
        where: { userId },
        select: [
          'packageId',
          'model3Count',
          'model4Count',
          'drawMjCount',
          'memberModel3Count',
          'memberModel4Count',
          'memberDrawMjCount',
          'useModel3Count',
          'useModel4Count',
          'useModel3Token',
          'useModel4Token',
          'useDrawMjToken',
          'expirationTime',
        ],
      });
      if (!res) {
        const user = await this.createBaseUserBalance(userId);
        if (user) {
          return await this.queryUserBalance(userId);
        } else {
          throw new HttpException(
            '查询当前用户余额失败！',
            HttpStatus.BAD_REQUEST
          );
        }
      }
      res.sumModel3Count = res.packageId
        ? res.model3Count + res.memberModel3Count
        : res.model3Count;
      res.sumModel4Count = res.packageId
        ? res.model4Count + res.memberModel4Count
        : res.model4Count;
      res.sumDrawMjCount = res.packageId
        ? res.drawMjCount + res.memberDrawMjCount
        : res.drawMjCount;
      res.expirationTime = res.expirationTime
        ? formatDate(res.expirationTime, 'YYYY-MM-DD')
        : null;
      return res;
    } catch (error) {
      console.log('error: ', error);
    }
  }

  /* 记录充值日志 */
  async saveRecordRechargeLog(logInfo: LogInfo) {
    const {
      userId,
      rechargeType,
      model3Count,
      model4Count,
      drawMjCount,
      days = -1,
      pkgName = '',
      extent = '',
    } = logInfo;
    if (!userId) {
      throw new HttpException(
        '当前用户不存在,记录充值日志异常',
        HttpStatus.BAD_REQUEST
      );
    }
    const uid = createRandomUid();
    return await this.accountLogEntity.save({
      userId,
      rechargeType,
      model3Count,
      model4Count,
      drawMjCount,
      days,
      extent,
      uid,
      pkgName,
    });
  }

  /* 创建一条基础的用户余额记录 */
  async createBaseUserBalance(
    userId: number,
    userBalanceInfo: UserBalanceInfo = {}
  ) {
    const {
      model3Count = 0,
      model4Count = 0,
      drawMjCount = 0,
    } = userBalanceInfo;
    const balance = await this.userBalanceEntity.findOne({ where: { userId } });
    if (balance) {
      throw new HttpException(
        '当前用户无需创建账户信息！',
        HttpStatus.BAD_REQUEST
      );
    }
    return await this.userBalanceEntity.save({
      userId,
      model3Count,
      model4Count,
      drawMjCount,
    });
  }

  /* 给用户增加固定次数额度 */
  async addBalanceToUser(userId, balance, days = -1) {
    try {
      const userBalanceInfo =
        (await this.userBalanceEntity.findOne({ where: { userId } })) ||
        (await this.createBaseUserBalance(userId));
      if (!userBalanceInfo) {
        throw new HttpException(
          '查询用户账户信息失败！',
          HttpStatus.BAD_REQUEST
        );
      }
      const {
        model3Count,
        model4Count,
        drawMjCount,
        memberModel3Count,
        memberModel4Count,
        memberDrawMjCount,
      } = userBalanceInfo;
      let params = {};
      /* 是否充值会员套餐 大于0的时间天数都属于套餐 */
      if (days > 0) {
        const { packageId } = balance;
        if (!packageId) {
          throw new HttpException(
            '缺失当前套餐ID、充值失败！',
            HttpStatus.BAD_REQUEST
          );
        }
        const pkgInfo = await this.cramiPackageEntity.findOne({
          where: { id: packageId },
        });
        if (!pkgInfo) {
          throw new HttpException('当前套餐不存在！', HttpStatus.BAD_REQUEST);
        }
        const { weight } = pkgInfo; // 套餐的权重 = 会员等级
        /* 如果不是会员那么则直接充值进入并修改会员信息为会员身份 */
        if (!userBalanceInfo.packageId) {
          params = {
            memberModel3Count: memberModel3Count + balance.model3Count,
            memberModel4Count: memberModel4Count + balance.model4Count,
            memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
            expirationTime: dayjs()
              .add(days > 0 ? days : 0, 'day')
              .format('YYYY-MM-DD HH:mm:ss'),
            packageId: packageId,
          };
        } else {
          /* 我当前使用的套餐信息 */
          const curPackageInfo = await this.cramiPackageEntity.findOne({
            where: { id: userBalanceInfo.packageId },
          });
          /* 如果是会员则  充值更高或当前等级的套餐会进行时间覆盖充值余额叠加  充值低等级套餐只会叠加次数 不更新到期时间 */
          /* pkgLevel： 我当前的套餐等级 weight： 充值套餐的等级高于或等于当前套餐 则叠加时间并合并额度 */
          if (weight >= curPackageInfo.weight) {
            params = {
              memberModel3Count: memberModel3Count + balance.model3Count,
              memberModel4Count: memberModel4Count + balance.model4Count,
              memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
              expirationTime: dayjs(userBalanceInfo.expirationTime)
                .add(days > 0 ? days : 0, 'day')
                .format('YYYY-MM-DD HH:mm:ss'),
              packageId: packageId,
            };
          }
          /* 如果充值套餐小于当前套餐等级 只叠加次数 不延长时间 也不变更会员等级 */
          if (weight < curPackageInfo.weight) {
            params = {
              memberModel3Count: memberModel3Count + balance.model3Count,
              memberModel4Count: memberModel4Count + balance.model4Count,
              memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
            };
          }
        }
      }
      /* 充值不限时卡直接叠加 */
      if (days <= 0) {
        params = {
          model3Count: model3Count + balance.model3Count,
          model4Count: model4Count + balance.model4Count,
          drawMjCount: drawMjCount + balance.drawMjCount,
        };
      }
      const result = await this.userBalanceEntity.update({ userId }, params);
      if (result.affected === 0) {
        throw new HttpException(`${userId}充值失败`, HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException('用户充值失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 支付成功给用户充值套餐 */
  async addBalanceToOrder(order) {
    console.log('充值的工单信息:', order);
    try {
      const { userId, goodsId } = order;
      const pkg = await this.cramiPackageEntity.findOne({
        where: { id: order.goodsId, status: 1 },
      });
      if (!pkg) {
        throw new HttpException(
          '非法操作、当前充值套餐暂不存在！',
          HttpStatus.BAD_REQUEST
        );
      }
      const {
        model3Count,
        model4Count,
        drawMjCount,
        days,
        name: pkgName,
      } = pkg;
      const money = {
        model3Count,
        model4Count,
        drawMjCount,
        days,
        packageId: order.goodsId,
      };
      /* 充值进账户 */
      await this.addBalanceToUser(userId, money, days);
      /* 记录充值日志 */
      await this.saveRecordRechargeLog({
        userId,
        rechargeType: RechargeType.SCAN_PAY,
        model3Count,
        model4Count,
        drawMjCount,
        pkgName,
        days,
      });
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException('充值失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询用户充值日志 */
  async getRechargeLog(req: Request, params) {
    const { page = 1, size = 20 } = params;
    const { id } = req.user;
    const [rows, count] = await this.accountLogEntity.findAndCount({
      where: { userId: id },
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    rows.forEach((item: any) => {
      item.expireDateCn = item.days > 0 ? `${item.days}天` : '永久';
      // item.expireDateCn = item.days > 0 ? `${item.days} Days` : 'Permanent';
    });
    return { rows: formatCreateOrUpdateDate(rows), count };
  }

  /* 管理端查询用户账户变更记录 */
  async getAccountLog(req, params) {
    try {
      const { page = 1, size = 10, userId, rechargeType, packageId } = params;
      const { role } = req.user;
      const where: any = {};
      rechargeType && (where.rechargeType = rechargeType);
      where.userId = userId || LessThan(100000);
      packageId && (where.packageId = { $like: `%${packageId}%` });
      const [rows, count] = await this.accountLogEntity.findAndCount({
        where,
        order: { id: 'DESC' },
        skip: (page - 1) * size,
        take: size,
      });
      const userIds = rows.map((item: any) => item.userId);
      const userInfo = await this.userEntity.find({
        where: { id: In(userIds) },
      });
      rows.forEach((item: any) => {
        const user = userInfo.find((user: any) => user.id === item.userId);
        item.username = user?.username;
        item.email = user?.email;
        item.phone = user?.phone;
        item.status = user?.status;
        item.avatar = user?.avatar;
      });
      if (role !== 'super') {
        rows.forEach((item: any) => {
          item.email = item.email ? hideString(item.email) : '';
          item.phone = item.phone ? hideString(item.phone) : '';
        });
      }
      return { rows, count };
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException('查询用户账户失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过用户id批量查询用户 */
  async queryUserBalanceByIds(ids: number[]) {
    return await this.userBalanceEntity.find({ where: { userId: In(ids) } });
  }

  /* MJ绘画失败退款 */
  async refundMjBalance(userId, amount) {
    return await this.deductFromBalance(userId, 'mjDraw', -amount);
  }

  async inheritVisitorData(req: Request) {
    const { fingerprint } = req.headers;
    const { id: userId } = req.user;
    await this.chatLogEntity.update(
      { userId: Number(fingerprint) },
      { userId }
    );
    await this.chatGroupEntity.update(
      { userId: Number(fingerprint) },
      { userId }
    );
    return 1;
  }

  async getVisitorCount(req) {
    const { fingerprint } = req.headers;
    const countChat = await this.chatLogEntity.count({
      where: { userId: fingerprint },
    });
    const countChatGroup = await this.chatGroupEntity.count({
      where: { userId: fingerprint },
    });

    return countChat || countChatGroup || 0;
  }

  /**
   * 检查用户是否需要进行认证
   * @param userId 用户ID
   */
  async checkUserCertification(userId: number): Promise<void> {
    const userInfo = await this.userEntity.findOne({
      where: { id: userId },
    });
    const userBalance = await this.userBalanceEntity.findOne({
      where: { userId },
    });

    if (!userInfo || !userBalance) {
      return;
      // throw new HttpException(
      //   '用户信息或用户余额信息不存在',
      //   HttpStatus.NOT_FOUND
      // );
    }

    // 获取配置项
    const {
      phoneValidationMessageCount,
      identityVerificationMessageCount,
      openIdentity,
      openPhoneValidation,
    } = await this.globalConfigService.getConfigs([
      'phoneValidationMessageCount',
      'identityVerificationMessageCount',
      'openIdentity',
      'openPhoneValidation',
    ]);

    // 格式化配置项为数字类型
    const phoneValidationCount = Number(phoneValidationMessageCount);
    const identityValidationCount = Number(identityVerificationMessageCount);

    const model3Count = Number(userBalance.useModel3Count) || 0;
    const model4Count = Number(userBalance.useModel4Count) || 0;
    const totalTokens = model3Count + model4Count;

    // 检查是否开启手机号验证并且是否已经绑定手机号
    if (
      openPhoneValidation === '1' &&
      totalTokens >= phoneValidationCount &&
      !userInfo.phone
    ) {
      throw new HttpException('请完成手机号绑定', HttpStatus.BAD_REQUEST);
    }

    // 检查是否开启实名认证并且是否已经完成实名认证
    if (
      openIdentity === '1' &&
      totalTokens >= identityValidationCount &&
      (!userInfo.realName || !userInfo.idCard)
    ) {
      throw new HttpException('请完成实名认证', HttpStatus.BAD_REQUEST);
    }

    // 如果不需要任何认证，方法直接结束，无需返回值
  }
}
