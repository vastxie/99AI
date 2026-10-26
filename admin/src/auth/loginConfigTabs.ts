import type { Component } from 'vue';

/** 「登录配置」页里由各登录渠道包贡献的页签 */
export interface LoginConfigTab {
  name: string;
  label: string;
  component: () => Promise<{ default: Component }>;
}
