/**
 * 语义化设计 token:文本 / 背景 / 边框 / 强调色 / 圆角 / 阴影。
 *
 * 冷调蓝定案(与用户端同一支主色 #4176e6、同一族冷灰):
 * 页面底是冷灰 `--u-bg-page`,卡片白底 + 1px 描边 + 极轻阴影;
 * 主操作、链接、选中态都走 `--u-accent`,选中底用 `--u-accent-soft`。
 * 页面与业务组件只准消费这些变量与 --el-*,禁止裸 hex(例外只在登记品牌色的
 * brand-colors.ts,由 scripts/check-design-guidelines.mjs 按文件名校验)。
 * 侧栏导航的几项(--u-nav-*)只给布局外壳用。
 */
export const semanticLight = {
  // 文本
  '--u-text-primary': '#1f2430',
  '--u-text-regular': '#3b4252',
  '--u-text-secondary': '#6b7280',
  '--u-text-placeholder': '#9aa3b2',
  // 背景
  '--u-bg-page': '#f5f7fa',
  '--u-bg-container': '#ffffff',
  '--u-bg-elevated': '#ffffff',
  '--u-bg-subtle': '#f8f9fc',
  '--u-bg-fill': '#f1f4f8',
  // 边框
  '--u-border': '#e6e9ef',
  '--u-border-light': '#edf0f4',
  // 遮罩(命令面板 / 滑出面板)
  '--u-overlay': 'rgb(31 36 48 / 32%)',
  // 强调色(同用户端 --primary-600 / 700)
  '--u-accent': '#4176e6',
  '--u-accent-soft': '#eaf0fd',
  '--u-accent-soft-hover': '#dbe6fb',
  '--u-accent-text': '#3460be',
  // 强调色底上的文字与图标(品牌标识块、登录页标识)
  '--u-on-accent': '#ffffff',
  // 侧栏导航:条目文字、悬停底
  '--u-nav-text': '#3b4252',
  '--u-nav-hover-bg': '#f1f4f8',
  // 圆角
  '--u-radius-s': '6px',
  '--u-radius-m': '8px',
  '--u-radius-l': '10px',
  '--u-radius-round': '999px',
  // 阴影(冷调,极轻)
  '--u-shadow-s': '0 1px 2px rgb(16 24 40 / 4%)',
  '--u-shadow-m': '0 4px 16px rgb(16 24 40 / 8%)',
  '--u-shadow-l': '0 16px 40px rgb(16 24 40 / 12%)',
};

export const semanticDark = {
  // 文本
  '--u-text-primary': '#e6e9ef',
  '--u-text-regular': '#c3c9d4',
  '--u-text-secondary': '#8b94a5',
  '--u-text-placeholder': '#5f6877',
  // 背景
  '--u-bg-page': '#0f1115',
  '--u-bg-container': '#161a21',
  '--u-bg-elevated': '#1c212a',
  '--u-bg-subtle': '#191e26',
  '--u-bg-fill': '#232935',
  // 边框
  '--u-border': '#2b3240',
  '--u-border-light': '#252b37',
  // 遮罩
  '--u-overlay': 'rgb(0 0 0 / 55%)',
  // 强调色(主色同用户端深色 --primary-400;文字取同族更亮一档)
  '--u-accent': '#679efe',
  '--u-accent-soft': '#1c2a44',
  '--u-accent-soft-hover': '#223559',
  '--u-accent-text': '#9dbcff',
  '--u-on-accent': '#0f1115',
  // 侧栏导航(比通用正文色与填充底更柔和一档)
  '--u-nav-text': '#a3acba',
  '--u-nav-hover-bg': '#1c212a',
  // 圆角(不随主题变化,重复声明以保持两份 token 对象同形)
  '--u-radius-s': '6px',
  '--u-radius-m': '8px',
  '--u-radius-l': '10px',
  '--u-radius-round': '999px',
  // 阴影
  '--u-shadow-s': '0 1px 2px rgb(0 0 0 / 40%)',
  '--u-shadow-m': '0 4px 16px rgb(0 0 0 / 50%)',
  '--u-shadow-l': '0 16px 40px rgb(0 0 0 / 60%)',
};
