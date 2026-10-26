import apiConfig from '@/api/modules/config';

/** 没配置站点名称时显示的名字 */
const FALLBACK_NAME = '99Agent';

/** 站点名称与标识：侧栏品牌区展示，「基础信息」页修改后直接写回这里，侧栏即时更新 */
const useBrandStore = defineStore('brand', () => {
  const siteName = ref('');
  const logoUrl = ref('');
  const displayName = computed(() => siteName.value.trim() || FALLBACK_NAME);

  let pending: Promise<void> | undefined;

  /** 读取一次站点配置；失败时允许下次再读 */
  function load() {
    pending ??= apiConfig
      .queryConfig({ keys: ['siteName', 'clientLogoPath'] })
      .then((res) => {
        siteName.value = res.data?.siteName || '';
        logoUrl.value = res.data?.clientLogoPath || '';
      })
      .catch(() => {
        pending = undefined;
      });
    return pending;
  }

  return { siteName, logoUrl, displayName, load };
});

export default useBrandStore;
