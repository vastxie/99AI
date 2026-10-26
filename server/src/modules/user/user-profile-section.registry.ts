import { Injectable, Logger } from '@nestjs/common';

export interface UserProfileSectionContext {
  userId: number;
  /** 统计区间起点；null 表示不限 */
  rangeStart: Date | null;
  /** 最近动态条数上限 */
  recentLimit: number;
}

/** 合并进「最近动态」的一条事件 */
export interface UserProfileEvent {
  type: string;
  title: string;
  summary: string;
  occurredAt: Date | string;
  link?: string;
}

export interface UserProfileSectionResult {
  /** 片段内容，对内核不透明，按包 id 原样下发给管理端 */
  data: unknown;
  events?: UserProfileEvent[];
}

/**
 * 后台用户画像的扩展片段：扩展包在构造时登记，内核 userProfile 模块的 UserProfileService 只负责汇总。
 * 包未装载时片段自然不存在，管理端按 sections 里有哪些键决定渲染什么。
 */
export interface UserProfileSection {
  /** 片段 id（建议用包 id） */
  id: string;
  build(context: UserProfileSectionContext): Promise<UserProfileSectionResult | null>;
}

@Injectable()
export class UserProfileSectionRegistry {
  private readonly sections = new Map<string, UserProfileSection>();

  register(section: UserProfileSection): void {
    if (!section?.id) throw new Error('用户画像片段必须提供 id');
    if (this.sections.has(section.id)) throw new Error(`用户画像片段 ${section.id} 已注册`);
    this.sections.set(section.id, section);
  }

  ids(): string[] {
    return [...this.sections.keys()];
  }

  /** 逐个构建；单个片段失败只记日志，不影响画像其余部分 */
  async buildAll(
    context: UserProfileSectionContext,
  ): Promise<{ sections: Record<string, unknown>; events: UserProfileEvent[] }> {
    const sections: Record<string, unknown> = {};
    const events: UserProfileEvent[] = [];
    for (const section of this.sections.values()) {
      try {
        const result = await section.build(context);
        if (!result) continue;
        sections[section.id] = result.data;
        events.push(...(result.events ?? []));
      } catch (error) {
        Logger.error(
          `用户画像片段 ${section.id} 构建失败: ${error?.message || error}`,
          'UserProfileSectionRegistry',
        );
      }
    }
    return { sections, events };
  }
}
