import { reactive } from 'vue';
import { createConfigSaveScheduler } from '@/utils/configSaveScheduler';

interface ModelRowLike {
  id: number;
  status: boolean | number | string;
}

/**
 * 模型启用开关：按模型 id 排队保存（同一个 id 一次一个请求，连点以最后一次为准）。
 * 开关显示最新的期望值、保存中加载态；成功后只更新当前列表里这一行（不整表重查），
 * 失败回到已确认的状态。翻页、筛选带来的整表刷新换掉行对象，也不覆盖仍在保存的期望值。
 */
export function createModelStatusToggles<Row extends ModelRowLike>(options: {
  rows: () => Row[];
  send: (id: number, enabled: boolean) => Promise<void>;
  onSaved?: (enabled: boolean) => void;
}) {
  /** 调度器的键用字符串形式的 id（对象键总是字符串，数字键会在入队时变成字符串） */
  const desired = reactive(new Map<string, boolean>());
  const keyOf = (id: number | string) => String(id);
  const rowOf = (key: string) => options.rows().find((row) => keyOf(row.id) === key);
  const raw = (enabled: boolean) => (enabled ? '1' : '0');

  const statusOf = (row: Row) => {
    const key = keyOf(row.id);
    return desired.has(key) ? desired.get(key)! : Boolean(row.status);
  };

  const scheduler = createConfigSaveScheduler<string>({
    send: async (values) => {
      for (const [id, value] of Object.entries(values))
        await options.send(Number(id), value === '1');
    },
    read: (key) => {
      const row = rowOf(key);
      return row ? raw(statusOf(row)) : undefined;
    },
    write: (key, value) => {
      const row = rowOf(key);
      if (row) (row as ModelRowLike).status = value === '1';
    },
    onSuccess: (saved) => {
      for (const value of Object.values(saved)) options.onSaved?.(value === '1');
    },
  });

  async function toggle(row: Row, enabled: boolean) {
    const key = keyOf(row.id);
    // 这一行没有保存在途或排队时，以列表里它现在（切换之前）的状态作为已确认值：
    // 列表刷新带回了别处改过的状态，不能沿用上一次保存时的基线
    if (!scheduler.saving(key)) scheduler.setConfirmed(key, raw(Boolean(row.status)));
    desired.set(key, enabled);
    const ok = await scheduler.enqueue({ [key]: raw(enabled) });
    if (!scheduler.saving(key)) desired.delete(key);
    return ok;
  }

  return {
    statusOf,
    saving: (id: number | string) => desired.has(keyOf(id)),
    toggle,
  };
}
