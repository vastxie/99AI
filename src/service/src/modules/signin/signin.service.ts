import { GlobalConfigService } from './../globalConfig/globalConfig.service';
import { UserBalanceService } from './../userBalance/userBalance.service';
import { HttpException, HttpStatus, Injectable, Logger, Global } from '@nestjs/common';
import { Request } from 'express';
import { SigninEntity } from './signIn.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import dayjs from '@/common/utils/date';
import { UserEntity } from '../user/user.entity';
import { RechargeType } from '@/common/constants/balance.constant';

@Injectable()
export class SigninService {
  constructor(
    @InjectRepository(SigninEntity)
    private readonly signinEntity: Repository<SigninEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly userBalanceService: UserBalanceService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  async sign(req: Request) {
    const { id: userId } = req.user;
    /* 使用格式化时间记录 */
    const formattedDate = dayjs(new Date()).format('YYYY-MM-DD');
    // 查询用户今天的签到记录
    const existingSignin = await this.signinEntity.findOne({
      where: { userId, signInDate: formattedDate },
    });
    /* 今日已签到 */
    if (existingSignin) {
      throw new HttpException('今日已签到、改天再来吧!.', HttpStatus.BAD_REQUEST);
    }
    /* 查询签到赠送奖励 并优先检测是否开启了赠送状态 */
    const { model3Count, model4Count, drawMjCount } = await this.globalConfigService.getSignatureGiftConfig();

    /* 创建新的签到记录 */
    await this.signinEntity.save({
      userId: userId,
      signInTime: new Date(),
      signInDate: formattedDate,
      isSigned: true,
    });

    await this.userBalanceService.addBalanceToUser(userId, { model3Count, model4Count, drawMjCount });
    /* 记录日志 */
    await this.userBalanceService.saveRecordRechargeLog({ userId, rechargeType: RechargeType.SIGN_IN, model3Count, model4Count, drawMjCount });
    /* 判断是否连续签到 */
    const yesterday = dayjs(new Date()).subtract(1, 'day').format('YYYY-MM-DD');
    const previousSignin = await this.signinEntity.findOne({
      where: { userId: userId, signInDate: yesterday },
    });
    /* 昨天签到了 连续签到 增加连续签到日期 */
    if (previousSignin) {
      Logger.debug(`用户${userId}昨天签到了、今天是连续签到！`, 'SigninService');
      const userInfo = await this.userEntity.findOne({ where: { id: userId } });
      if (!userInfo) {
        throw new HttpException('用户不存在', HttpStatus.BAD_REQUEST);
      }
      const { consecutiveDays = 0 } = userInfo;
      await this.userEntity.update({ id: userId }, { consecutiveDays: consecutiveDays + 1 });
    } else {
      Logger.debug(`用户${userId}昨天没签到、今天重置天数！`, 'SigninService');
      await this.userEntity.update({ id: userId }, { consecutiveDays: 1 });
    }

    return 'Sign in successful.';
  }

  async getSigninLog(req: Request) {
    try {
      const { id: userId } = req.user;
      const firstDay = dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss');
      const lastDay = dayjs().endOf('month').format('YYYY-MM-DD HH:mm:ss');
      const queryBuilder = this.signinEntity.createQueryBuilder('signin');
      const signInData = await queryBuilder
        .select('signin.signInDate as signInDate, signin.isSigned as isSigned')
        .andWhere('signin.userId = :userId', { userId: req.user.id })
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
        const existingData = signInData.find((item) => item.signInDate === date);
        if (!existingData) {
          res.push({ signInDate: date, isSigned: false });
        } else {
          existingData.isSigned = true;
          res.push(existingData);
        }
      }
      return res;
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException('获取签到数据失败！', HttpStatus.BAD_REQUEST);
    }
  }
}
