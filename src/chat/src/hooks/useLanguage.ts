import { useAppStore } from '@/store';
import { enUS, zhCN, zhTW } from 'naive-ui';
import { computed } from 'vue';

export function useLanguage() {
  const appStore = useAppStore();

  // 计算 Naive UI 的语言配置
  const naiveUILocale = computed(() => {
    switch (appStore.language) {
      case 'en-US': return enUS;
      case 'zh-CN': return zhCN;
      case 'zh-TW': return zhTW;
      default: return zhCN;
    }
  });

  // 监听 appStore.language 的变化，并据此更新 Vue I18n 的语言环境
  // watch(() => appStore.language, (newLocale) => {
  //   setLocale(newLocale);
  // }, { immediate: true });

  return { naiveUILocale };
}
