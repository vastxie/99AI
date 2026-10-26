import { requireRegisteredUser } from '@/common/auth/request-user';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { UserService } from '@/modules/user/user.service';
import { forwardRef, HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { SigninEntity } from './signIn.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import dayjs from 'dayjs';
import { RechargeType } from '../shared/balance.constant';

@Injectable()
export class SigninService {
  constructor(
    @InjectRepository(SigninEntity)
    private readonly signinEntity: Repository<SigninEntity>,
    private readonly userBalanceService: UserBalanceService,
    private readonly globalConfigService: GlobalConfigService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
  ) {}

  /* 签到赠送额度：未开启签到时拒绝 */
  private async getSignatureGiftConfig(): Promise<{ credits: number }> {
    const { signInStatus = 0, signInCredits = 0 } = await this.globalConfigService.getConfigs([
      'signInStatus',
      'signInCredits',
    ]);
    if (Number(signInStatus) !== 1) {
      throw new HttpException('签到功能暂未开放!', HttpStatus.BAD_REQUEST);
    }
    return { credits: Number(signInCredits) };
  }

  async sign(req: Request) {
    // 访客由路由上的 RegisteredUserAuthGuard 以 403 拦下
    const { id: userId } = requireRegisteredUser(req);
    /* 使用格式化时间记录 */
    const formattedDate = dayjs(new Date()).format('YYYY-MM-DD');
    /* 查询签到赠送奖励 并优先检测是否开启了赠送状态 */
    const { credits } = await this.getSignatureGiftConfig();

    try {
      await this.dataSource.transaction(async manager => {
        const signinRepository = manager.getRepository(SigninEntity);
        // 查询用户今天的签到记录
        const existingSignin = await signinRepository.findOne({
          where: { userId, signInDate: formattedDate },
        });
        /* 今日已签到 */
        if (existingSignin) {
          throw new HttpException('今日已签到、改天再来吧!.', HttpStatus.BAD_REQUEST);
        }

        /* 昨天签到了就累加连续天数，否则从 1 重新计 */
        const yesterday = dayjs(new Date()).subtract(1, 'day').format('YYYY-MM-DD');
        const previousSignin = await signinRepository.findOne({
          where: { userId: userId, signInDate: yesterday },
        });
        const consecutiveDays = previousSignin
          ? Number(previousSignin.consecutiveDays || 0) + 1
          : 1;

        /* 创建新的签到记录 */
        await signinRepository.save({
          userId: userId,
          signInTime: new Date(),
          signInDate: formattedDate,
          isSigned: true,
          consecutiveDays,
        });

        await this.userBalanceService.addBalanceToUser(
          userId,
          {
            credits,
          },
          -1,
          manager,
        );
        /* 记录日志 */
        await this.userBalanceService.saveRecordRechargeLog(
          {
            userId,
            rechargeType: RechargeType.SIGN_IN,
            credits,
          },
          manager,
        );
      });
    } catch (error) {
      if (this.isDuplicateEntryError(error)) {
        throw new HttpException('今日已签到、改天再来吧!.', HttpStatus.BAD_REQUEST);
      }
      throw error;
    }

    // 清除用户缓存，确保获取最新数据
    await this.userService.clearUserCache(userId);

    return 'Sign in successful.';
  }

  /** 今日是否已签到与当前连续天数（供用户端签到面板展示） */
  async getStatus(req: Request) {
    const { id: userId } = requireRegisteredUser(req);
    const today = dayjs(new Date()).format('YYYY-MM-DD');
    const latest = await this.signinEntity.findOne({
      where: { userId },
      order: { signInDate: 'DESC' },
    });
    const yesterday = dayjs(new Date()).subtract(1, 'day').format('YYYY-MM-DD');
    const streakAlive = latest && (latest.signInDate === today || latest.signInDate === yesterday);
    return {
      signedToday: Boolean(latest && latest.signInDate === today),
      consecutiveDays: streakAlive ? Number(latest.consecutiveDays || 0) : 0,
    };
  }

  private isDuplicateEntryError(error: any) {
    return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
  }

  async getSigninLog(req: Request) {
    const { id: userId } = requireRegisteredUser(req);
    try {
      const firstDay = dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss');
      const lastDay = dayjs().endOf('month').format('YYYY-MM-DD HH:mm:ss');
      const queryBuilder = this.signinEntity.createQueryBuilder('signin');
      const signInData = await queryBuilder
        .select('signin.signInDate as signInDate, signin.isSigned as isSigned')
        .andWhere('signin.userId = :userId', { userId })
        .andWhere('signin.signInTime >= :firstDay', { firstDay })
        .andWhere('signin.signInTime <= :lastDay', { lastDay })
        .getRawMany();
      const startDate = new Date(firstDay);
      const endDate = new Date(lastDay);
      const dateRange = [];
      const currentDate = new Date(startDate);
      /* 组装最近三十天结构 */
      while (currentDate <= endDate) {
        dateRange.push(dayjs(new Date(currentDate)).format('YYYY-MM-DD'));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      const res = [];
      // 检查每一天是否有数据，若无则添加默认数据
      for (const date of dateRange) {
        const existingData = signInData.find(item => item.signInDate === date);
        if (!existingData) {
          res.push({ signInDate: date, isSigned: false });
        } else {
          existingData.isSigned = true;
          res.push(existingData);
        }
      }
      return res;
    } catch (error) {
      Logger.error(`获取签到数据失败: ${error.message}`, getErrorStack(error), 'SigninService');
      throw new HttpException('获取签到数据失败！', HttpStatus.BAD_REQUEST);
    }
  }
}
