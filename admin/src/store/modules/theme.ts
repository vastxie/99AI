/**
 * 明暗模式：用户的选择（浅色 / 深色 / 跟随系统）存在本地，实际生效的模式写成 <html class="dark">，
 * Element Plus 的暗色变量与 tokens 的深色一组都挂在这个 class 上。
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

/** index.html 的首屏脚本读同一个键 */
const STORAGE_KEY = 'admin-color-scheme';

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    // 空串是早先「跟随系统」的写法
    if (saved === '') return 'system';
  } catch {
    // 读不到本地存储（如隐私模式）时用默认值
  }
  return 'light';
}

function writePreference(value: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 写不进去只影响下次打开时的初始模式
  }
}

const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(readPreference());

  const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(systemQuery.matches);
  systemQuery.addEventListener('change', (event) => {
    systemDark.value = event.matches;
  });

  /** 实际生效的模式 */
  const scheme = computed<ColorScheme>(() => {
    if (preference.value === 'system') return systemDark.value ? 'dark' : 'light';
    return preference.value;
  });

  // 同步刷新 class：明暗切换的视图过渡要在回调返回时就拿到新画面
  watch(
    scheme,
    (value) => {
      document.documentElement.classList.toggle('dark', value === 'dark');
    },
    { immediate: true, flush: 'sync' },
  );
  watch(preference, writePreference);

  function setPreference(value: ThemePreference) {
    preference.value = value;
  }

  return { preference, scheme, setPreference };
});

export default useThemeStore;
