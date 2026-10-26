/**
 * 工具 Provider 系统核心类型定义
 *
 * 所有 AI 能力统一为 工具 Provider，通过 ToolProviderRegistry 注册和管理
 */

/** 工具 Provider 分类 */
export type ToolProviderCategory = 'search' | 'creative' | 'analysis' | 'productivity';

/** 工具 Provider 最终产物提示，仅用于前端生成中占位展示 */
export interface ToolProviderOutputHint {
  type: 'image' | 'video' | 'file' | 'audio' | 'document';
  /** 最终产物宽高比，例如 16:9、4:3；可由运行时参数推导补充 */
  aspectRatio?: string;
}

/** 工具 Provider 元数据 — 描述一个 工具 Provider 的基本信息 */
export interface ToolProviderMetadata {
  /** 分类 */
  category: ToolProviderCategory;
  /** 显示名称（如 "联网搜索"） */
  displayName: string;
  /** 描述 */
  description: string;
  /** 前端图标名（可选） */
  icon?: string;
  /** 最终产物提示（可选），不参与 LLM 调用 */
  outputHint?: ToolProviderOutputHint;
  /** 工具 Provider 运行时，只用于管理端只读展示 */
  runtime?: string;
}

/** 工具 Provider 信息 — 注册后的只读视图 */
export interface ToolProviderInfo {
  /** 该 provider 支持的工具名列表 */
  toolNames: string[];
  /** 元数据 */
  metadata: ToolProviderMetadata;
  /** provider 类名 */
  provider: string;
}
