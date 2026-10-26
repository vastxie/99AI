/** 「文件存储」页的字段描述；各存储包按作用域前缀（public / private）贡献自己的字段 */
export interface StorageField {
  key: string;
  label: string;
  type: 'input' | 'password' | 'textarea' | 'select' | 'switch' | 'number';
  required: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  showCondition?: (settings: any) => boolean;
  defaultValue?: string;
  activeText?: string;
  inactiveText?: string;
  tooltip?: string[];
  helpText?: string;
  min?: number;
  max?: number;
}

export interface StorageSection {
  name: string;
  icon?: string;
  iconColor?: string;
  fields: StorageField[];
}

export type StorageScope = 'public' | 'private';

/** 一个存储包在下拉里的选项与它在某作用域下需要的配置字段 */
export interface StorageProviderContribution {
  value: string;
  label: string;
  fields: (scope: StorageScope) => StorageField[];
}
