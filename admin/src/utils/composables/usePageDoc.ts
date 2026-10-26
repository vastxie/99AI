import type { Ref } from 'vue';
import { onBeforeUnmount, ref, unref, watchEffect } from 'vue';

/**
 * 页面帮助文档登记:页面在 setup 中调用 usePageDoc(docUrl) 登记当前页的文档链接,
 * 顶部 chrome 工具条以文字链接形式展示(替代原 PageHeader 标题旁的 ? 图标)。
 */

/** 当前页面帮助文档链接(全局单例,随页面卸载自动清空) */
const pageDocUrl = ref('');

/** 登记当前页面的帮助文档链接 */
export function usePageDoc(url: Ref<string> | string) {
  watchEffect(() => {
    pageDocUrl.value = unref(url) || '';
  });
  onBeforeUnmount(() => {
    pageDocUrl.value = '';
  });
}

/** 读取当前页面帮助文档链接(供布局工具条使用) */
export function usePageDocUrl() {
  return pageDocUrl;
}
