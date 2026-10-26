export interface FilterFieldOption {
  label: string;
  value: string | number;
}

/**
 * 关键词位的远程选择器配置(如按昵称/手机号/邮箱搜用户,选中后 keyword 为用户 id)。
 * 用它替代「关键词框搜 id + 面板里再放一个同名字段」的重复入口。
 */
export interface KeywordSearch {
  /** 按关键词远程搜索候选项 */
  fetchOptions: (query: string) => Promise<FilterFieldOption[]>;
  /** 已有值回查显示文案(路由参数钻取时用) */
  resolveLabel?: (value: string | number) => Promise<string | undefined>;
}

export interface FilterField {
  /** 对应 filters 对象中的键 */
  key: string;
  label: string;
  type: 'input' | 'select' | 'remote-select' | 'date-range';
  placeholder?: string;
  /** select / remote-select 的静态选项 */
  options?: FilterFieldOption[];
  /** remote-select 的远程取数(如用户搜索) */
  fetchOptions?: (query: string) => Promise<FilterFieldOption[]>;
  /**
   * remote-select 按已有值回查标签(如按 userId 查用户名)。
   * 筛选条件由外部带入(路由参数钻取)时,没有它 chips 只能显示原始 ID。
   */
  resolveLabel?: (value: string | number) => Promise<string | undefined>;
  /** 面板内控件宽度 px,默认撑满栅格 */
  width?: number;
  /** 面板分组标题(如「筛选」「排序」),同组字段相邻渲染 */
  group?: string;
  /** 是否计入筛选徽标与 chips(排序等非筛选字段设为 false),默认 true */
  countAsFilter?: boolean;
}
