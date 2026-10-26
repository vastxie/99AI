import { requireRequestUser } from '@/common/auth/request-user';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  FindOptionsWhere,
  In,
  Like,
  QueryDeepPartialEntity,
  Repository,
} from 'typeorm';
import type { Request } from 'express';
import type { QueryViolationDto } from './dto/queryViolation.dto';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';
import { UserEntity } from '@/modules/user/user.entity';
import { ContentFilterHit, ContentFilterPort } from '@/modules/contentFilter/content-filter.port';
import { UserViolationStats, ViolationRecord } from './violation.types';
import {
  VocabularyMeta,
  VocabularyStats,
  getVocabularyMeta,
  getVocabularyStats,
  mergeVocabularies,
  resetVocabularyLoader,
} from './vocabulary-loader';
import { WhitelistEntity } from './whitelist.entity';
import { ViolationLogEntity } from './violationLog.entity';

@Injectable()
export class BadWordsService implements OnModuleInit, ContentFilterPort {
  private readonly WHITELIST_KEY = 'badWords:whitelist';
  private readonly SYSTEM_WORDS_KEY = 'badWords:system';
  private readonly CACHE_TTL = 60 * 60 * 24; // 24小时缓存
  private tencentTmsClient: any = null;
  private tencentTmsClientKey = '';

  constructor(
    @InjectRepository(WhitelistEntity)
    private readonly whitelistEntity: Repository<WhitelistEntity>,
    @InjectRepository(ViolationLogEntity)
    private readonly violationLogEntity: Repository<ViolationLogEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  onModuleInit(): void {
    void this.loadSystemWords();
    void this.loadWhitelist();
  }

  /* ========== 词库管理 ========== */

  /**
   * 获取所有可用词库列表（管理端展示）
   * 响应结构保持不变：{ vocabularies: [{ id, name, description, count }], stats: { totalVocabularies, totalWords } }
   */
  async getVocabularies(): Promise<{
    vocabularies: VocabularyMeta[];
    stats: VocabularyStats;
  }> {
    const vocabularies = await getVocabularyMeta();
    const stats = await getVocabularyStats();
    return { vocabularies, stats };
  }

  /* 敏感词匹配 */
  async customSensitiveWords(
    content: string,
    userId: number,
    idempotencyKey?: string,
  ): Promise<ContentFilterHit | null> {
    const triggeredWords = [];

    // 获取已过滤白名单的系统词库
    const badWords = await this.getSystemWordsFromCache();

    for (let i = 0; i < badWords.length; i++) {
      const word = badWords[i];
      if (content.includes(word)) {
        triggeredWords.push(word);
      }
    }

    if (triggeredWords.length) {
      Logger.warn(
        `敏感词审核: 检测到违规 | userId=${userId} | 触发词数=${
          triggeredWords.length
        } | 触发词=${triggeredWords.join(',')}`,
        'BadWordsService',
      );
      const violationCounted = await this.recordUserBadWords(
        userId,
        content,
        triggeredWords,
        ['敏感词'],
        '敏感词检测',
        idempotencyKey,
      );
      return { words: triggeredWords, violationCounted };
    }

    return null;
  }

  /* 敏感词配置：腾讯云文本审核优先，其次系统词库；都未开启时返回 null */
  async getSensitiveConfig(): Promise<
    | {
        useType: 'tencent';
        tencentSecretId: string;
        tencentSecretKey: string;
        tencentRegion: string;
        tencentTextBizType: string;
      }
    | { useType: 'system'; selectedVocabularies: string[] }
    | null
  > {
    const {
      tencentTextStatus = 0,
      tencentSecretId,
      tencentSecretKey,
      tencentRegion,
      tencentTextBizType,
      systemSensitiveStatus = 0,
      selectedVocabularies = '[]',
    } = await this.globalConfigService.getConfigs([
      'tencentTextStatus',
      'tencentSecretId',
      'tencentSecretKey',
      'tencentRegion',
      'tencentTextBizType',
      'systemSensitiveStatus',
      'selectedVocabularies',
    ]);
    if (Number(tencentTextStatus) === 1) {
      return {
        useType: 'tencent',
        tencentSecretId,
        tencentSecretKey,
        tencentRegion: tencentRegion || 'ap-guangzhou',
        tencentTextBizType,
      };
    }
    if (Number(systemSensitiveStatus) === 1) {
      let vocabIds: string[] = [];
      try {
        vocabIds = JSON.parse(selectedVocabularies as string);
        if (!Array.isArray(vocabIds)) vocabIds = [];
      } catch {
        vocabIds = [];
      }
      return { useType: 'system', selectedVocabularies: vocabIds };
    }
    return null;
  }

  /* 敏感词检测 先检测腾讯云文本审核 后检测系统词库；命中返回命中信息，未命中返回 null */
  async checkBadWords(
    content: string,
    userId: number,
    idempotencyKey?: string,
  ): Promise<ContentFilterHit | null> {
    const config = await this.getSensitiveConfig();
    if (!config) return null;

    if (config.useType === 'tencent') {
      const hit = await this.tencentCheckBadWords(content, config, userId, idempotencyKey);
      if (hit) return hit;
    }
    return this.customSensitiveWords(content, userId, idempotencyKey);
  }

  /**
   * ContentFilterPort 实现：总开关 isSensitiveWordFilter 关闭时直通；
   * 违规记录与正式用户违规计数由本包在同一事务内落库；稳定预检摘要用于
   * continuation / 客户端重试幂等。其他实现未计数时仍由内核兜底累计。
   */
  async check(input: {
    text: string;
    userId?: number | null;
    idempotencyKey?: string;
  }): Promise<ContentFilterHit | null> {
    const enabled = await this.globalConfigService.getConfigs(['isSensitiveWordFilter']);
    if (String(enabled ?? '') !== '1') return null;
    return this.checkBadWords(input.text, input.userId || 0, input.idempotencyKey);
  }

  private ensureTencentTmsClient(config: any) {
    const secretId = String(config.tencentSecretId || '').trim();
    const secretKey = String(config.tencentSecretKey || '').trim();
    const region = String(config.tencentRegion || 'ap-guangzhou').trim() || 'ap-guangzhou';
    const clientKey = [secretId, secretKey, region].join(':');

    if (this.tencentTmsClient && this.tencentTmsClientKey === clientKey) {
      return this.tencentTmsClient;
    }

    const tencentcloud = require('tencentcloud-sdk-nodejs-tms');
    const TmsClient = tencentcloud.tms.v20201229.Client;
    this.tencentTmsClient = new TmsClient({
      credential: {
        secretId,
        secretKey,
      },
      region,
      profile: { httpProfile: { reqTimeout: 10 } },
    });
    this.tencentTmsClientKey = clientKey;
    return this.tencentTmsClient;
  }

  private mapTencentLabel(label?: string) {
    const labelMap: Record<string, string> = {
      Normal: '正常',
      Porn: '色情',
      Abuse: '谩骂',
      Ad: '广告',
      Illegal: '违法',
      Spam: '垃圾信息',
      Polity: '涉政',
      Terrorism: '暴恐',
      Custom: '自定义规则',
    };
    if (!label) return '内容安全风险';
    return labelMap[label] || label;
  }

  private collectTencentRiskTypes(response: any): string[] {
    const labels = new Set<string>();
    if (response?.Label && response.Label !== 'Normal') {
      labels.add(this.mapTencentLabel(response.Label));
    }
    if (response?.SubLabel) {
      labels.add(response.SubLabel);
    }

    const details = Array.isArray(response?.DetailResults) ? response.DetailResults : [];
    details
      .filter((item: any) => item?.Suggestion && item.Suggestion !== 'Pass')
      .forEach((item: any) => {
        if (item?.Label && item.Label !== 'Normal') {
          labels.add(this.mapTencentLabel(item.Label));
        }
        if (item?.SubLabel) {
          labels.add(item.SubLabel);
        }
      });

    return labels.size ? Array.from(labels) : ['内容安全风险'];
  }

  private collectTencentKeywords(response: any): string[] {
    const keywords = new Set<string>();
    const addKeyword = (word: unknown) => {
      const value = String(word || '').trim();
      if (value) keywords.add(value);
    };

    if (Array.isArray(response?.Keywords)) {
      response.Keywords.forEach(addKeyword);
    }

    const details = Array.isArray(response?.DetailResults) ? response.DetailResults : [];
    details.forEach((item: any) => {
      if (Array.isArray(item?.Keywords)) {
        item.Keywords.forEach(addKeyword);
      }
      if (Array.isArray(item?.HitInfos)) {
        item.HitInfos.forEach((hit: any) => addKeyword(hit?.Keyword));
      }
    });

    return keywords.size ? Array.from(keywords) : ['***'];
  }

  /* 通过腾讯云文本审核检测；命中返回命中信息（含给用户的提示），未命中或跳过返回 null */
  async tencentCheckBadWords(
    content: string,
    config: any,
    userId: number,
    idempotencyKey?: string,
  ): Promise<ContentFilterHit | null> {
    if (!content || content.trim() === '') {
      return null;
    }

    const secretId = String(config.tencentSecretId || '').trim();
    const secretKey = String(config.tencentSecretKey || '').trim();
    if (!secretId || !secretKey) {
      Logger.warn('腾讯云文本审核未配置密钥，跳过云审核', 'BadWordsService');
      return null;
    }

    try {
      const client = this.ensureTencentTmsClient(config);
      const response = await client.TextModeration({
        Content: Buffer.from(content, 'utf8').toString('base64'),
        BizType: config.tencentTextBizType || undefined,
        DataId:
          this.normalizePreflightKey(idempotencyKey) ||
          `u${userId || 0}_${Date.now()}`.slice(0, 64),
        SourceLanguage: 'zh',
        Type: 'TEXT',
        User: userId ? { UserId: String(userId), AccountType: 7 } : undefined,
      });

      const suggestion = response?.Suggestion || 'Pass';
      if (suggestion !== 'Pass') {
        const types = this.collectTencentRiskTypes(response);
        const keywords = this.collectTencentKeywords(response);
        Logger.warn(
          `腾讯云审核: 检测到风险 | userId=${userId} | 违规类型=${types.join(
            ',',
          )} | suggestion=${suggestion}`,
          'BadWordsService',
        );
        const violationCounted = await this.recordUserBadWords(
          userId,
          content,
          keywords,
          types,
          '腾讯云检测',
          idempotencyKey,
        );
        return {
          words: keywords,
          message: `您提交的信息未通过内容安全检测（${types.join('、')}），请合规使用！`,
          violationCounted,
        };
      }
      return null;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const code = error?.code || error?.name || 'unknown';
      Logger.error(`腾讯云文本审核服务异常: ${code}`, getErrorStack(error), 'BadWordsService');
    }
    return null;
  }

  /* 测试腾讯云文本审核配置（管理端） */
  async testTencentTextConfig() {
    const config = await this.globalConfigService.getConfigs([
      'tencentSecretId',
      'tencentSecretKey',
      'tencentRegion',
      'tencentTextBizType',
    ]);

    if (!config.tencentSecretId || !config.tencentSecretKey) {
      return { success: false, message: '腾讯云 SecretId 或 SecretKey 未配置' };
    }

    try {
      const client = this.ensureTencentTmsClient(config);
      const response = await client.TextModeration({
        Content: Buffer.from('这是一个测试文本', 'utf8').toString('base64'),
        BizType: config.tencentTextBizType || undefined,
        DataId: `config_test_${Date.now()}`,
        SourceLanguage: 'zh',
        Type: 'TEXT',
      });
      return {
        success: true,
        message: '腾讯云文本审核配置测试成功',
        detail: response?.Suggestion
          ? `测试文本审核返回结果: ${response.Suggestion}`
          : '测试请求已完成',
      };
    } catch (error) {
      Logger.error(
        `腾讯云文本审核配置测试失败: ${error.message}`,
        getErrorStack(error),
        'BadWordsService',
      );
      return { success: false, message: error.message || '腾讯云文本审核配置测试失败' };
    }
  }

  /* ========== 用户画像：违规统计（ContentFilterPort） ========== */

  async getUserViolationStats(
    userId: number,
    rangeStart: Date | null,
  ): Promise<UserViolationStats> {
    const baseQuery = this.violationLogEntity
      .createQueryBuilder('violation')
      .where('violation.userId = :userId', { userId });
    const rangeQuery = baseQuery.clone();
    if (rangeStart) {
      rangeQuery.andWhere('violation.createdAt >= :rangeStart', { rangeStart });
    }

    const [total, rangeRaw, latestRaw, sourceRows] = await Promise.all([
      this.violationLogEntity.count({ where: { userId } }),
      rangeQuery.select('COUNT(violation.id)', 'count').getRawOne(),
      baseQuery.clone().select('MAX(violation.createdAt)', 'latestAt').getRawOne(),
      baseQuery
        .clone()
        .select('COALESCE(violation.typeOriginCn, "unknown")', 'source')
        .addSelect('COUNT(violation.id)', 'count')
        .groupBy('COALESCE(violation.typeOriginCn, "unknown")')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany(),
    ]);

    return {
      total,
      inRange: Number(rangeRaw?.count || 0),
      latestAt: latestRaw?.latestAt || null,
      bySource: (sourceRows || []).map(item => ({
        source: item.source || 'unknown',
        count: Number(item.count || 0),
      })),
    };
  }

  async listRecentViolations(userId: number, limit: number): Promise<ViolationRecord[]> {
    return this.violationLogEntity.find({
      where: { userId },
      select: { id: true, userId: true, typeCn: true, typeOriginCn: true, createdAt: true },
      order: { id: 'DESC' },
      take: limit,
    });
  }

  /* 从缓存获取系统词库 */
  async getSystemWordsFromCache(): Promise<string[]> {
    try {
      const cached = await this.redisCacheService.get({ key: this.SYSTEM_WORDS_KEY });
      if (cached) {
        return JSON.parse(cached);
      }

      await this.loadSystemWords();
      const newCached = await this.redisCacheService.get({ key: this.SYSTEM_WORDS_KEY });
      return newCached ? JSON.parse(newCached) : [];
    } catch (error) {
      Logger.error(
        `获取系统词库缓存失败: ${error.message}`,
        getErrorStack(error),
        'BadWordsService',
      );
      return [];
    }
  }

  /* 加载系统词库到Redis缓存（自动过滤白名单） */
  async loadSystemWords() {
    try {
      // 获取敏感词配置
      const config = await this.getSensitiveConfig();

      // 获取选中的词库ID列表
      let selectedIds: string[] = [];
      if (config && config.useType === 'system' && config.selectedVocabularies?.length > 0) {
        selectedIds = config.selectedVocabularies;
      }

      // 如果没有选择任何词库，清空缓存并返回
      if (selectedIds.length === 0) {
        await this.redisCacheService.del({ key: this.SYSTEM_WORDS_KEY });
        Logger.log('系统词库已清空（未选择任何词库）', 'BadWordsService');
        return;
      }

      // 合并选中的词库（只从 data/vocabularies 懒加载被选中的文件）
      const mergedWords = await mergeVocabularies(selectedIds);
      const allWords = Array.from(mergedWords);

      // 获取白名单
      const whitelistData = await this.whitelistEntity.find();
      const whitelist = new Set(whitelistData.map(item => item.word));

      // 过滤掉白名单中的词语
      const filteredWords = allWords.filter(word => !whitelist.has(word));

      await this.redisCacheService.set(
        { key: this.SYSTEM_WORDS_KEY, val: JSON.stringify(filteredWords) },
        this.CACHE_TTL,
      );

      Logger.log(
        `系统词库已加载 [${selectedIds.join(', ')}]，原始${allWords.length}个，过滤后${
          filteredWords.length
        }个（白名单${whitelist.size}个）`,
        'BadWordsService',
      );
    } catch (error) {
      Logger.error(`加载系统词库失败: ${error.message}`, getErrorStack(error), 'BadWordsService');
    }
  }

  /* 重新加载系统词库（配置更新时调用） */
  async reloadSystemWords() {
    // 先清除 Redis 缓存与进程内词库缓存（词库文件更新后无需重启即可生效）
    resetVocabularyLoader();
    await this.redisCacheService.del({ key: this.SYSTEM_WORDS_KEY });
    // 重新加载
    await this.loadSystemWords();
    Logger.log('敏感词库已重新加载', 'BadWordsService');
  }

  /* 加载白名单到Redis缓存 */
  async loadWhitelist() {
    try {
      const data = await this.whitelistEntity.find();
      const words = data.map(t => t.word);

      await this.redisCacheService.set(
        { key: this.WHITELIST_KEY, val: JSON.stringify(words) },
        this.CACHE_TTL,
      );

      Logger.log(`白名单已加载，共${words.length}个词语`, 'BadWordsService');
    } catch (error) {
      Logger.error(`加载白名单失败: ${error.message}`, getErrorStack(error), 'BadWordsService');
    }
  }

  /* 清除白名单和系统词库缓存 */
  async clearWhitelistCache() {
    try {
      await this.redisCacheService.del({ key: this.WHITELIST_KEY });
      // 同时清除系统词库缓存，因为需要重新过滤白名单
      await this.redisCacheService.del({ key: this.SYSTEM_WORDS_KEY });
      Logger.log('已清除白名单和系统词库缓存', 'BadWordsService');
    } catch (error) {
      Logger.error(`清除白名单缓存失败: ${error.message}`, getErrorStack(error), 'BadWordsService');
    }
  }

  /* ========== 白名单管理 ========== */

  /* 查询白名单 */
  async queryWhitelist(query: any) {
    const { page = 1, size = 20, word } = query;
    const where: any = {};
    word && (where.word = Like(`%${word}%`));

    const [rows, count] = await this.whitelistEntity.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });

    return { rows, count };
  }

  /* 添加白名单词语 */
  async addWhitelist(body: { word: string; remark?: string }) {
    const { word } = body;

    const existing = await this.whitelistEntity.findOne({ where: { word } });
    if (existing) {
      throw new HttpException('该词语已在白名单中', HttpStatus.BAD_REQUEST);
    }

    await this.whitelistEntity.save({ word, remark: body.remark });
    await this.clearWhitelistCache();

    Logger.log(`添加白名单词语: ${word}`, 'BadWordsService');
    return '添加白名单成功';
  }

  /* 批量添加白名单 */
  async batchAddWhitelist(body: { words: string }) {
    const { words: wordsStr } = body;

    const words = wordsStr
      .split(/[\s\n\t\r]+/)
      .map(word => word.trim())
      .filter(word => word.length > 0);

    if (words.length > 10000) {
      throw new HttpException('单次最多添加10000个词语', HttpStatus.BAD_REQUEST);
    }

    if (words.length === 0) {
      throw new HttpException('请输入有效的词语', HttpStatus.BAD_REQUEST);
    }

    const uniqueWords = [...new Set(words)];

    const existingWords = await this.whitelistEntity.find({
      where: { word: In(uniqueWords) },
      select: { word: true },
    });
    const existingWordSet = new Set(existingWords.map(item => item.word));

    const newWords = uniqueWords.filter(word => !existingWordSet.has(word));

    if (newWords.length === 0) {
      return {
        message: '批量添加完成',
        total: words.length,
        success: 0,
        skipped: words.length,
        alreadyExists: words.length,
      };
    }

    const entities = newWords.map(word => ({ word }));
    await this.whitelistEntity.save(entities);

    await this.clearWhitelistCache();

    Logger.log(`批量添加白名单: 共${newWords.length}个词语`, 'BadWordsService');

    return {
      message: '批量添加成功',
      total: words.length,
      success: newWords.length,
      skipped: existingWordSet.size,
      alreadyExists: existingWordSet.size,
    };
  }

  /* 删除白名单 */
  async delWhitelist(body: { id: number }) {
    const { id } = body;
    const item = await this.whitelistEntity.findOne({ where: { id } });

    if (!item) {
      throw new HttpException('白名单记录不存在', HttpStatus.BAD_REQUEST);
    }

    const res = await this.whitelistEntity.delete({ id });
    if ((res.affected ?? 0) > 0) {
      await this.clearWhitelistCache();
      Logger.log(`删除白名单词语: ${item.word}`, 'BadWordsService');
      return '删除白名单成功';
    } else {
      throw new HttpException('删除白名单失败', HttpStatus.BAD_REQUEST);
    }
  }

  /* 修改白名单 */
  async updateWhitelist(body: { id: number; word?: string; remark?: string }) {
    const { id, word } = body;

    const item = await this.whitelistEntity.findOne({ where: { id } });
    if (!item) {
      throw new HttpException('白名单记录不存在', HttpStatus.BAD_REQUEST);
    }

    if (word && word !== item.word) {
      const existing = await this.whitelistEntity.findOne({ where: { word } });
      if (existing && existing.id !== id) {
        throw new HttpException('该词语已在白名单中', HttpStatus.BAD_REQUEST);
      }
    }

    const updateData: any = {};
    word !== undefined && (updateData.word = word);
    body.remark !== undefined && (updateData.remark = body.remark);

    const res = await this.whitelistEntity.update({ id }, updateData);
    if ((res.affected ?? 0) > 0) {
      await this.clearWhitelistCache();
      Logger.log(`修改白名单词语: ${item.word} -> ${word || item.word}`, 'BadWordsService');
      return '修改白名单成功';
    } else {
      throw new HttpException('修改白名单失败', HttpStatus.BAD_REQUEST);
    }
  }

  private normalizePreflightKey(value?: string): string | undefined {
    const key = String(value || '')
      .trim()
      .toLowerCase();
    return /^[a-f0-9]{64}$/u.test(key) ? key : undefined;
  }

  private isDuplicatePreflightRecord(error: unknown): boolean {
    const candidate = error as {
      code?: string;
      errno?: number;
      driverError?: { code?: string; errno?: number };
    };
    return (
      candidate?.code === 'ER_DUP_ENTRY' ||
      candidate?.driverError?.code === 'ER_DUP_ENTRY' ||
      candidate?.errno === 1062 ||
      candidate?.driverError?.errno === 1062
    );
  }

  private async writeViolationRecord(
    manager: EntityManager,
    data: {
      userId: number;
      content: string;
      words: string;
      typeCn: string;
      typeOriginCn: string;
      preflightKey: string | null;
    },
  ): Promise<boolean> {
    let inserted = true;
    try {
      // 可空列写 null：实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），在仓库边界收口
      await manager
        .getRepository(ViolationLogEntity)
        .insert(data as QueryDeepPartialEntity<ViolationLogEntity>);
    } catch (error) {
      if (!data.preflightKey || !this.isDuplicatePreflightRecord(error)) throw error;
      inserted = false;
    }
    if (inserted && data.userId > 0) {
      await manager.getRepository(UserEntity).increment({ id: data.userId }, 'violationCount', 1);
    }
    // true 表示正式用户的计数已由本事务处理；重复摘要也代表前次已处理。
    return data.userId > 0;
  }

  /* 违规记录与正式用户累计次数同事务写入；稳定摘要把 crash/retry 收敛为一次。 */
  async recordUserBadWords(
    userId: number,
    content: string,
    words: string[],
    typeCn: string[],
    typeOriginCn: string,
    idempotencyKey?: string,
  ): Promise<boolean> {
    const preflightKey = this.normalizePreflightKey(idempotencyKey);
    const data = {
      userId,
      content,
      words: JSON.stringify(words),
      typeCn: JSON.stringify(typeCn),
      typeOriginCn,
      preflightKey: preflightKey || null,
    };
    try {
      return await this.violationLogEntity.manager.transaction(manager =>
        this.writeViolationRecord(manager, data),
      );
    } catch (error) {
      Logger.error('记录用户违规失败', undefined, 'BadWordsService');
      // 有稳定摘要时不能退化为非幂等累计；让调用方安全拒绝并保留可重试事实。
      if (preflightKey) {
        throw new HttpException('内容安全记录失败，请稍后再试', HttpStatus.SERVICE_UNAVAILABLE);
      }
      return false;
    }
  }

  /* 违规记录 */
  async violation(req: Request, query: QueryViolationDto) {
    requireRequestUser(req);
    const { page = 1, size = 10, userId, typeOriginCn } = query;
    const where: FindOptionsWhere<ViolationLogEntity> = {};
    userId && (where['userId'] = userId);
    typeOriginCn && (where['typeOriginCn'] = typeOriginCn);

    const [rows, count] = await this.violationLogEntity.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });

    const userIds = [...new Set(rows.map(t => t.userId))];
    const usersInfo = await this.userEntity.find({
      where: { id: In(userIds) },
      select: {
        id: true,
        avatar: true,
        username: true,
        email: true,
        violationCount: true,
        status: true,
      },
    });

    rows.forEach((t: any) => {
      let user: any = usersInfo.find(u => u.id === t.userId);

      if (!user) {
        user = {
          id: t.userId,
          avatar: '',
          username: '未知用户',
          email: null,
          violationCount: 0,
          status: 'deleted',
          isDeleted: true,
          isVisitor: false,
        };
      } else {
        user.isVisitor = false;
      }

      t.userInfo = user;
    });

    return { rows, count };
  }
}
