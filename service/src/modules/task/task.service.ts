import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ModelsService } from '../models/models.service';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { GlobalConfigService } from './../globalConfig/globalConfig.service';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(UserBalanceEntity)
    private readonly userBalanceEntity: Repository<UserBalanceEntity>,
    private readonly globalConfigService: GlobalConfigService,
    private readonly modelsService: ModelsService,
  ) {}

  /* 每小时刷新一次微信的token */
  @Cron(CronExpression.EVERY_HOUR)
  handleCron() {
    Logger.debug('Automatically refresh WeChat access every hour Token', 'TaskService');
    this.globalConfigService.getWechatAccessToken();
  }

  /* 每两钟执行一次检测会员过期任务 */
  // @Cron(CronExpression.EVERY_2_SECONDS)
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkUserMemerExpire() {
    const expireUsers = await this.userBalanceEntity.find({
      where: { expirationTime: LessThanOrEqual(new Date()) },
    });
    if (!expireUsers || !expireUsers.length) return;
    expireUsers.forEach((user: any) => {
      this.userBalanceEntity
        .update(
          { id: user.id },
          {
            expirationTime: null,
            packageId: 0,
            memberModel3Count: 0,
            memberModel4Count: 0,
            memberDrawMjCount: 0,
            appCats: '',
          },
        )
        .then(res => {
          Logger.debug(`${user.id}会员已到期、清空所有余额并移除会员身份！`, 'TaskService');
        });
    });
  }

  /**
   * 查找文件的多种可能路径
   * @param filename 文件名
   * @returns 找到的文件路径或null
   */
  private findFilePath(filename: string): string | null {
    const possiblePaths = [
      path.join(process.cwd(), filename), // 当前工作目录
      path.join(__dirname, '..', '..', '..', filename), // 应用根目录
      path.join(__dirname, filename), // 与主程序同级
      path.resolve(filename), // 绝对路径解析
      path.join(process.cwd(), '..', filename), // 上级目录
      path.join(process.cwd(), 'dist', filename), // dist目录
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }

    return null;
  }
}
