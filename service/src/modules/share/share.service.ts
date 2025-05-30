import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { Share } from './share.entity';

@Injectable()
export class ShareService {
  constructor(
    @InjectRepository(Share)
    private shareRepository: Repository<Share>,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  private generateShareCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createShare(htmlContent: string): Promise<string> {
    let shareCode: string;
    let isUnique = false;

    while (!isUnique) {
      shareCode = this.generateShareCode();
      const existing = await this.shareRepository.findOne({
        where: { shareCode },
      });
      if (!existing) {
        isUnique = true;
      }
    }

    const share = new Share();
    share.shareCode = shareCode;
    share.htmlContent = htmlContent;

    try {
      await this.shareRepository.save(share);
      const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
      console.log(siteUrl);
      return `${siteUrl}/?shareCode=${shareCode}`;
    } catch (error) {
      console.error('保存分享内容失败:', error);
      // 可能的失败原因：内容过大、数据库连接问题等
      throw new Error(`创建分享失败: ${error.message || '未知错误'}`);
    }
  }

  async getShareByCode(shareCode: string): Promise<Share> {
    const share = await this.shareRepository.findOne({ where: { shareCode } });
    return await this.shareRepository.findOne({ where: { shareCode } });
  }
}
