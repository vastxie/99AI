import { onBeforeUnmount, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import apiConfig from '@/api/modules/config';
import { createConfigSaveScheduler, type ConfigValues } from '@/utils/configSaveScheduler';

/** 界面值与配置原始字符串之间的转换（数值、数组等不是字符串的字段） */
export interface ConfigFieldCodec {
  /** 界面值 → 配置的原始字符串 */
  toRaw: (value: unknown) => string;
  /** 配置的原始字符串 → 界面值 */
  fromRaw: (raw: string) => unknown;
}

export interface ConfigAutoSaveOptions {
  /**
   * 与保存结果联动的表单模型（键为配置项 key）：保存成功且界面仍是发出的值时回写规范后的值，
   * 失败且界面仍是发出的值时回滚到已确认的值；用户已经改成别的值时不动界面。
   * 不是字符串的字段用 codecs 指明转换。
   */
  form?: Record<string, any>;
  codecs?: Record<string, ConfigFieldCodec>;
  /** 界面不是扁平表单时（嵌套对象、多个表单）：读出界面值（转成原始字符串）与写回原始字符串 */
  read?: (key: string) => unknown;
  write?: (key: string, raw: string) => void;
}

/** 配置值统一规范成去掉首尾空格的字符串 */
export const normalizeConfigValue = (value: unknown) => String(value ?? '').trim();

/** 数值字段：界面是数字，配置是字符串；配置为空或不是有效数字时界面显示 fallback（与页面加载时的默认值一致） */
export function numberConfigCodec(fallback?: number): ConfigFieldCodec {
  return {
    toRaw: (value) => normalizeConfigValue(value),
    fromRaw: (raw) => {
      const value = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(value)) return fallback ?? '';
      return value;
    },
  };
}

/**
 * 配置页字段级自动保存。
 *
 * 保存走 configSaveScheduler：同一页面的保存按顺序一次一个，快速连续修改以最后一次为准，
 * 成组保存（saveFields）一次请求整组发出；成功、失败都只在界面仍是发出的值时才写回。
 * 配置未加载完成时：saveField 静默丢弃（页面此时被 ConfigLoadGuard 挡住，触发者只会是控件挂载时的
 * 自发 change），saveFields 给出提示。
 */
export default function useConfigAutoSave(options: ConfigAutoSaveOptions = {}) {
  const isReady = ref(false);
  const isUnmounting = ref(false);
  const loadFailed = ref(false);
  /** 已确认值（服务端最近一次确认的原始字符串） */
  const originalValues = reactive<ConfigValues>({});
  /** 有保存在途或排队的键（开关绑定 :loading） */
  const pendingKeys = reactive(new Set<string>());
  const { form, codecs = {} } = options;

  const read = (key: string): string | undefined => {
    if (options.read) return normalizeConfigValue(options.read(key));
    if (!form || !(key in form)) return undefined;
    const codec = codecs[key];
    return codec ? codec.toRaw(form[key]) : normalizeConfigValue(form[key]);
  };
  const write = (key: string, raw: string) => {
    if (options.write) {
      options.write(key, raw);
      return;
    }
    if (!form) return;
    const codec = codecs[key];
    form[key] = codec ? codec.fromRaw(raw) : raw;
  };

  const scheduler = createConfigSaveScheduler<string>({
    send: async (values) => {
      await apiConfig.setConfig({
        settings: Object.entries(values).map(([configKey, configVal]) => ({
          configKey,
          configVal,
        })),
      });
    },
    read,
    write,
    onSuccess: (saved, successMessage) => {
      Object.assign(originalValues, saved);
      ElMessage.success(successMessage ?? '保存成功');
    },
    isActive: () => !isUnmounting.value,
  });

  onBeforeUnmount(() => {
    isUnmounting.value = true;
  });

  /** 初始配置加载成功后调用：记下服务端的原始值（不要先转换类型再传入）并放行保存 */
  function initFromConfig(data: Record<string, any>, keys?: string[]) {
    const keyList = keys ?? Object.keys(data ?? {});
    const values: ConfigValues = {};
    keyList.forEach((key) => {
      values[key] = String(data?.[key] ?? '');
    });
    scheduler.init(values);
    Object.assign(originalValues, values);
    isReady.value = true;
    loadFailed.value = false;
  }

  /** 初始配置加载失败时调用：提示用户刷新，避免后续编辑被静默丢弃 */
  function markLoadFailed() {
    loadFailed.value = true;
    ElMessage.error('配置加载失败，请刷新页面后重试');
  }

  async function track(keys: string[], run: () => Promise<boolean>) {
    keys.forEach((key) => pendingKeys.add(key));
    try {
      return await run();
    } finally {
      keys.forEach((key) => {
        if (!scheduler.saving(key)) pendingKeys.delete(key);
      });
    }
  }

  /**
   * 保存单个配置项。返回这次修改最终是否保存成功（值未变化视为成功）。
   * @param opts.onSaved 真正发出请求并成功后的回调，参数是这次确认的值（不要从表单读，表单可能已经改了）
   */
  async function saveField(
    key: string,
    value: unknown,
    opts?: { onSaved?: (saved: ConfigValues) => void },
  ): Promise<boolean> {
    if (isUnmounting.value || !isReady.value) return false;
    const codec = codecs[key];
    const raw = codec && !options.read ? codec.toRaw(value) : normalizeConfigValue(value);
    return track([key], () => scheduler.enqueue({ [key]: raw }, { onSaved: opts?.onSaved }));
  }

  /** 成组保存（一次请求，失败整组回滚）；用于必须一起生效的几项（互斥开关、清空配置） */
  async function saveFields(
    values: Record<string, unknown>,
    opts?: { onSaved?: (saved: ConfigValues) => void; successMessage?: string },
  ): Promise<boolean> {
    if (isUnmounting.value) return false;
    if (!isReady.value) {
      ElMessage.warning('配置尚未加载完成，本次修改未保存');
      return false;
    }
    const keys = Object.keys(values);
    if (!keys.length) return true;
    const raws: ConfigValues = {};
    keys.forEach((key) => {
      const codec = codecs[key];
      raws[key] =
        codec && !options.read ? codec.toRaw(values[key]) : normalizeConfigValue(values[key]);
    });
    return track(keys, () =>
      scheduler.enqueue(raws, {
        group: true,
        onSaved: opts?.onSaved,
        successMessage: opts?.successMessage,
      }),
    );
  }

  /** 这个键有保存在途或排队（开关加载中、按钮禁用） */
  function saving(key: string) {
    return pendingKeys.has(key);
  }

  /** 这个键最近一次有效的意图（排队或在途的最后一次保存，没有则为已确认值），原始字符串 */
  function desiredValue(key: string) {
    return scheduler.desired(key);
  }

  /** 外部修正已确认值（例如另一个接口已经改过这一项） */
  function setOriginalValue(key: string, value: string) {
    scheduler.setConfirmed(key, value);
    originalValues[key] = value;
  }

  return {
    isReady,
    isUnmounting,
    loadFailed,
    originalValues,
    initFromConfig,
    markLoadFailed,
    saveField,
    saveFields,
    saving,
    desiredValue,
    setOriginalValue,
  };
}
