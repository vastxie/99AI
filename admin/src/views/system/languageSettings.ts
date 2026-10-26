import { watch } from 'vue';
import { ElMessage } from 'element-plus';

/** 所有可用的语言选项 */
export const ALL_LANGUAGES = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
];

/** enabledLanguages 以 JSON 字符串保存；解析并只保留内置语言，为空或无效时视为全部启用 */
export function parseEnabledLanguages(raw: unknown): string[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }
  const values = ALL_LANGUAGES.map((lang) => lang.value);
  const enabled = Array.isArray(list) ? list.filter((item) => values.includes(item)) : [];
  return enabled.length > 0 ? enabled : values;
}

export interface LanguageForm {
  enabledLanguages: string[];
  defaultLanguage: string;
}

interface LanguageAutoSave {
  saveFields: (values: Record<string, unknown>) => Promise<boolean>;
  desiredValue: (key: string) => string | undefined;
}

/**
 * 语言设置：启用语言与默认语言总是按同一份界面快照成组保存（改哪一项都带上另一项），
 * 连续修改时后一次完整覆盖前一次，失败一起回滚，服务端不会出现「语言集合按新的、默认语言按旧的」的组合。
 * 不允许清空语言集合：清空时界面回到最近一次有效的意图（在途或排队的保存，没有则为已保存的值）。
 */
export function useLanguageSettings(form: LanguageForm, autoSave: LanguageAutoSave) {
  // 默认语言不在启用列表里时自动换成第一个启用的语言；没有启用任何语言时清空
  watch(
    () => form.enabledLanguages,
    (newVal) => {
      if (newVal && newVal.length > 0 && !newVal.includes(form.defaultLanguage)) {
        form.defaultLanguage = newVal[0];
      }
      if (!newVal || newVal.length === 0) {
        form.defaultLanguage = '';
      }
    },
  );

  function saveLanguages() {
    return autoSave.saveFields({
      enabledLanguages: form.enabledLanguages,
      defaultLanguage: form.defaultLanguage,
    });
  }

  /** 勾选变化（Element Plus 在 v-model 更新后的下一个 tick 才触发 change，watch 已调整过默认语言） */
  async function onEnabledLanguagesChange(value: string[]) {
    if (!value || value.length === 0) {
      // 默认语言不在恢复后的集合里时（例如后台还没有语言配置），由上面的 watch 换成第一个启用的语言
      form.enabledLanguages = parseEnabledLanguages(autoSave.desiredValue('enabledLanguages'));
      form.defaultLanguage = autoSave.desiredValue('defaultLanguage') || '';
      ElMessage.warning('请至少保留一种语言');
      return false;
    }
    return saveLanguages();
  }

  function onDefaultLanguageChange() {
    return saveLanguages();
  }

  return { onEnabledLanguagesChange, onDefaultLanguageChange };
}
