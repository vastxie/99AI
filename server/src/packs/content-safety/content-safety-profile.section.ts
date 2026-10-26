import { Injectable } from '@nestjs/common';
import {
  UserProfileEvent,
  UserProfileSectionRegistry,
} from '@/modules/user/user-profile-section.registry';
import { BadWordsService } from './badWords/badWords.service';
import { ViolationRecord } from './badWords/violation.types';

interface ViolationSummary {
  id: number;
  userId: number;
  source: string;
  typeLabels: string[];
  summary: string;
  occurredAt: Date;
  link: string;
}

/**
 * 后台用户画像的内容安全片段：违规统计、最近违规摘要、来源 / 类型 Top，以及合并进最近动态的违规事件。
 * 构造时向内核 UserProfileSectionRegistry 登记为 `contentSafety` 片段，管理端内容安全包按此渲染。
 */
@Injectable()
export class ContentSafetyProfileSection {
  constructor(
    registry: UserProfileSectionRegistry,
    private readonly badWordsService: BadWordsService,
  ) {
    registry.register({ id: 'contentSafety', build: input => this.build(input) });
  }

  private async build(input: { userId: number; rangeStart: Date | null; recentLimit: number }) {
    const { userId, rangeStart, recentLimit } = input;
    const [stats, records] = await Promise.all([
      this.badWordsService.getUserViolationStats(userId, rangeStart),
      this.badWordsService.listRecentViolations(userId, recentLimit),
    ]);
    const recentViolations = records.map(record => this.format(record));
    const link = this.link(userId);
    const events: UserProfileEvent[] = recentViolations.map(violation => ({
      type: 'violation',
      title: '违规记录',
      summary: violation.summary,
      occurredAt: violation.occurredAt,
      link: violation.link,
    }));
    return {
      data: {
        totalViolationRecords: stats.total,
        rangeViolationCount: stats.inRange,
        latestViolationAt: stats.latestAt || null,
        recentViolations,
        sourceTop: stats.bySource,
        recentTypeTop: this.typeTop(recentViolations),
        link,
      },
      events,
    };
  }

  private format(record: ViolationRecord): ViolationSummary {
    const typeLabels = this.parseJsonStringArray(record.typeCn);
    const source = record.typeOriginCn || 'unknown';
    const typeSummary = typeLabels.length ? typeLabels.join(' / ') : '未标注类型';
    return {
      id: record.id,
      userId: record.userId,
      source,
      typeLabels,
      summary: `${source} · ${typeSummary}`,
      occurredAt: record.createdAt,
      link: this.link(record.userId),
    };
  }

  private typeTop(violations: ViolationSummary[]) {
    const counts = new Map<string, number>();
    for (const violation of violations) {
      for (const label of violation.typeLabels) {
        if (label) counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  }

  private link(userId: number) {
    return `/security/violation?userId=${userId}`;
  }

  private parseJsonStringArray(value?: string | null): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(item => String(item)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
}
