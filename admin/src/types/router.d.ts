export {};

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题：侧栏、面包屑、页面搜索与浏览器标签页共用 */
    title?: string;
    /** UnoCSS 图标类名，如 i-lucide:users */
    icon?: string;
    /** 允许访问的角色；不写表示登录后都能访问 */
    roles?: string[];
    /** 不出现在侧栏、首页与页面搜索里（详情页、旧链接的跳转页等） */
    hidden?: boolean;
    /** 隐藏页面打开时，侧栏高亮哪一项（填那一项的完整路径） */
    activeNav?: string;
  }
}
