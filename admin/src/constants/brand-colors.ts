/**
 * 内核页面区块的标识色（设计准则：裸 hex 白名单的唯一落地处）；扩展包的品牌色在各包自己的 brand-colors 里登记。
 *
 * 这些取值不随本站亮暗主题翻转，因此不进 `--u-*` token；但也不允许散落在页面里 —— 页面一律从这里引用。
 */
export const BRAND_COLORS = {
  // 文件存储各区块
  localStorage: '#1890ff',
  userFiles: '#13c2c2',
  publicStorage: '#ff9900',
  privateStorage: '#4f46e5',
} as const;
