import { hideString } from '@/common/utils';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { In, Like, Repository } from 'typeorm';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { UserEntity } from '../user/user.entity';
import { BadWordsEntity } from './badWords.entity';
import { AddBadWordDto } from './dto/addBadWords.dto';
import { DelBadWordsDto } from './dto/delBadWords.dto';
import { QueryBadWordsDto } from './dto/queryBadWords.dto';
import { UpdateBadWordsDto } from './dto/updateBadWords.dto';
import { ViolationLogEntity } from './violationLog.entity';

@Injectable()
export class BadWordsService implements OnModuleInit {
  private badWords: string[];
  constructor(
    @InjectRepository(BadWordsEntity)
    private readonly badWordsEntity: Repository<BadWordsEntity>,
    @InjectRepository(ViolationLogEntity)
    private readonly violationLogEntity: Repository<ViolationLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly globalConfigService: GlobalConfigService
  ) {
    this.badWords = [];
  }

  async onModuleInit() {
    this.loadBadWords();
  }

  /* 敏感词匹配 */
  // async customSensitiveWords(content, userId) {
  //   const triggeredWords = [];
  //   for (let i = 0; i < this.badWords.length; i++) {
  //     const word = this.badWords[i];
  //     if (content.includes(word)) {
  //       triggeredWords.push(word);
  //     }
  //   }
  //   if (triggeredWords.length) {
  //     await this.recordUserBadWords(
  //       userId,
  //       content,
  //       triggeredWords,
  //       ['自定义'],
  //       '自定义检测'
  //     );
  //     const tips = `您提交的信息中包含违规的内容、我们已对您的账户进行标记、请合规使用！`;
  //     throw new HttpException(tips, HttpStatus.BAD_REQUEST);
  //   }
  // }
  /* 敏感词匹配 */
  async customSensitiveWords(content, userId) {
    const triggeredWords = [];

    // 遍历敏感词列表，查找内容中是否包含敏感词
    for (let i = 0; i < this.badWords.length; i++) {
      const word = this.badWords[i];
      if (content.includes(word)) {
        triggeredWords.push(word); // 如果包含敏感词，将其加入到数组中
      }
    }

    if (triggeredWords.length) {
      // 如果找到敏感词，记录用户提交的违规内容
      await this.recordUserBadWords(
        userId,
        content,
        triggeredWords,
        ['自定义'],
        '自定义检测'
      );
    }

    // 返回检测到的敏感词列表（如果没有敏感词，返回空数组）
    return triggeredWords;
  }

  /* 敏感词检测 先检测百度敏感词 后检测自定义的 */
  async checkBadWords(content: string, userId: number) {
    const config = await this.globalConfigService.getSensitiveConfig();
    /* 如果有则启动配置检测 没有则跳过 */
    if (config) {
      await this.checkBadWordsByConfig(content, config, userId);
    }
    /* 自定义敏感词检测 */
    return await this.customSensitiveWords(content, userId);
  }

  /* 通过配置信息去检测敏感词 */
  async checkBadWordsByConfig(content: string, config: any, userId) {
    const { useType } = config;
    useType === 'baidu' &&
      (await this.baiduCheckBadWords(
        content,
        config.baiduTextAccessToken,
        userId
      ));
  }

  /* 提取百度云敏感词违规类型 */
  extractContent(str) {
    const pattern = /存在(.*?)不合规/;
    const match = str.match(pattern);
    return match ? match[1] : '';
  }

  /* 通过百度云敏感词检测 */
  async baiduCheckBadWords(
    content: string,
    accessToken: string,
    userId: number
  ) {
    if (!accessToken) return;
    const url = `https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined?access_token=${accessToken}}`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    const response = await axios.post(url, { text: content }, { headers });
    const { conclusion, error_code, error_msg, conclusionType, data } =
      response.data;
    if (error_code) {
      console.log('百度文本检测出现错误、请查看配置信息: ', error_msg);
    }
    // conclusion 审核结果，可取值：合规、不合规、疑似、审核失败
    // conclusionType 1.合规，2.不合规，3.疑似，4.审核失败
    if (conclusionType !== 1) {
      const types = [
        ...new Set(data.map((item) => this.extractContent(item.msg))),
      ];
      await this.recordUserBadWords(
        userId,
        content,
        ['***'],
        types,
        '百度云检测'
      );
      const tips = `您提交的信息中包含${types.join(
        ','
      )}的内容、我们已对您的账户进行标记、请合规使用！`;
      throw new HttpException(tips, HttpStatus.BAD_REQUEST);
    }
  }

  /* formarTips */
  formarTips(wordList) {
    const categorys = wordList.map((t) => t.category);
    const unSet = [...new Set(categorys)];
    return `您提交的内容中包含${unSet.join(
      ','
    )}的信息、我们已对您账号进行标记、请合规使用！`;
  }

  /* 加载自定义的敏感词 */
  async loadBadWords() {
    const data = await this.badWordsEntity.find({
      where: { status: 1 },
      select: ['word'],
    });
    this.badWords = data.map((t) => t.word);
  }

  /* 查询自定义的敏感词 */
  async queryBadWords(query: QueryBadWordsDto) {
    const { page = 1, size = 500, word, status } = query;
    const where: any = {};
    [0, 1, '0', '1'].includes(status) && (where.status = status);
    word && (where.word = Like(`%${word}%`));
    const [rows, count] = await this.badWordsEntity.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'ASC' },
    });
    return { rows, count };
  }

  /* 删除自定义敏感词 */
  async delBadWords(body: DelBadWordsDto) {
    const b = await this.badWordsEntity.findOne({ where: { id: body.id } });
    if (!b) {
      throw new HttpException(
        '敏感词不存在,请检查您的提交信息',
        HttpStatus.BAD_REQUEST
      );
    }
    const res = await this.badWordsEntity.delete({ id: body.id });
    if (res.affected > 0) {
      await this.loadBadWords();
      return '删除敏感词成功';
    } else {
      throw new HttpException('删除敏感词失败', HttpStatus.BAD_REQUEST);
    }
  }

  /* 修改自定义敏感词 */
  async updateBadWords(body: UpdateBadWordsDto) {
    const { id, word, status } = body;
    const b = await this.badWordsEntity.findOne({ where: { word } });
    if (b) {
      throw new HttpException(
        '敏感词已经存在了、请勿重复添加',
        HttpStatus.BAD_REQUEST
      );
    }
    const res = await this.badWordsEntity.update({ id }, { word, status });
    if (res.affected > 0) {
      await this.loadBadWords();
      return '更新敏感词成功';
    } else {
      throw new HttpException('更新敏感词失败', HttpStatus.BAD_REQUEST);
    }
  }

  async addBadWord(body: AddBadWordDto) {
    const { word } = body;
    const b = await this.badWordsEntity.findOne({ where: { word } });
    if (b) {
      throw new HttpException(
        '敏感词已存在,请检查您的提交信息',
        HttpStatus.BAD_REQUEST
      );
    }
    await this.badWordsEntity.save({ word });
    await this.loadBadWords();
    return '添加敏感词成功';
  }

  /* 记录用户违规次数内容 */
  async recordUserBadWords(userId, content, words, typeCn, typeOriginCn) {
    const data = {
      userId,
      content,
      words: JSON.stringify(words),
      typeCn: JSON.stringify(typeCn),
      typeOriginCn,
    };
    try {
      await this.userEntity
        .createQueryBuilder()
        .update(UserEntity)
        .set({ violationCount: () => 'violationCount + 1' })
        .where('id = :userId', { userId })
        .execute();
      await this.violationLogEntity.save(data);
    } catch (error) {
      console.log('error: ', error);
    }
  }

  /* 违规记录 */
  async violation(req, query) {
    const { role } = req.user;
    const { page = 1, size = 10, userId, typeOriginCn } = query;
    const where = {};
    userId && (where['userId'] = userId);
    typeOriginCn && (where['typeOriginCn'] = typeOriginCn);
    const [rows, count] = await this.violationLogEntity.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    const userIds = [...new Set(rows.map((t) => t.userId))];
    const usersInfo = await this.userEntity.find({
      where: { id: In(userIds) },
      select: ['id', 'avatar', 'username', 'email', 'violationCount', 'status'],
    });
    rows.forEach((t: any) => {
      // 查找用户信息，如果没有找到，返回空对象
      const user: any = usersInfo.find((u) => u.id === t.userId) || {};

      // const user: any = usersInfo.find((u) => u.id === t.userId);
      role !== 'super' && (user.email = hideString(user.email));
      t.userInfo = user;
    });

    return { rows, count };
  }
}
