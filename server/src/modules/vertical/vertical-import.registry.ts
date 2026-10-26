import { Injectable, Logger } from '@nestjs/common';
import type { VerticalManifestV1 } from '@99agent/contracts';

export interface VerticalImportContext {
  manifest: VerticalManifestV1;
  /** 清单文件所在目录（绝对路径），相对路径都以它解析 */
  manifestDir: string;
  dryRun: boolean;
}

export interface VerticalImportSectionResult {
  applied: string[];
  skipped: string[];
  manual: string[];
}

/** 扩展包对清单 extensions.<section> 的处理器；在构造时向注册表注册 */
export interface VerticalImportHandler {
  readonly section: string;
  apply(payload: unknown, context: VerticalImportContext): Promise<VerticalImportSectionResult>;
}

@Injectable()
export class VerticalImportRegistry {
  private readonly handlers = new Map<string, VerticalImportHandler>();

  register(handler: VerticalImportHandler) {
    if (this.handlers.has(handler.section)) {
      Logger.warn(
        `重复注册垂直包导入段 ${handler.section}，后者覆盖前者`,
        'VerticalImportRegistry',
      );
    }
    this.handlers.set(handler.section, handler);
  }

  get(section: string): VerticalImportHandler | undefined {
    return this.handlers.get(section);
  }

  sections(): string[] {
    return [...this.handlers.keys()];
  }
}
