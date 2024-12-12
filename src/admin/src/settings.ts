import type { RecursiveRequired, Settings } from '#/global';
import settingsDefault from '@/settings.default';
import { defaultsDeep } from 'lodash-es';

const globalSettings: Settings.all = {
  // 请在此处编写或粘贴配置代码
  menu: {
    menuMode: 'single',
    enableSubMenuCollapseButton: true,
    enableHotkeys: false,
  },
  app: {
    enableDynamicTitle: true,
  },
  topbar: {
    /**
     * static 默认，静止，跟随页面滚动
     * fixed 固定，不跟随页面滚动，始终固定在顶部
     * sticky 粘性，页面往下滚动时隐藏，往上滚动时显示
     */
    mode: 'static',
  },
  toolbar: {
    fullscreen: false,
    pageReload: true,
  },
  navSearch: {
    enableHotkeys: false,
  },
  copyright: {
    enable: false,
  },
};

export default defaultsDeep(
  globalSettings,
  settingsDefault
) as RecursiveRequired<Settings.all>;
