/**
 * 配置保存调度（纯逻辑，不依赖 Vue / Element Plus，供配置页自动保存与模型启用开关共用）。
 *
 * 每个键记「已确认值」（服务端最近一次确认的原始字符串）。每次保存是一个操作：入队时记下这些键的值快照，
 * 一个页面同一时刻只有一个请求在途，其余按到达顺序排队；成组的操作永远一次请求整组发出。
 *
 * - 入队：排队中（还没开始）的操作若键全被新操作覆盖，删掉它，它的调用方随新操作的结果结束；
 *   部分重叠的照原样保留、按顺序整组发送（不拆散成组操作）。在途的操作不动。
 * - 开始：单键操作的快照等于已确认值时跳过（算成功，不发请求）。
 * - 成功：已确认值更新为快照；按操作通知一次（成功提示与 onSaved，参数是这次的快照）；
 *   只有「界面当前值仍等于快照、后面也没有排队的操作覆盖它」的键才写回界面。
 * - 失败：同样只有界面当前值仍等于快照、后面没有排队的操作覆盖它的键，才写回已确认值；
 *   用户已经在改、或后面的操作会再发的，界面不动。
 * - 停用（页面卸载）后：不再开始新的操作（排队的都按失败结束），在途的回来只更新已确认值。
 */

export type ConfigValues = Record<string, string>;

export interface ConfigSaveSchedulerOptions<K extends string | number = string> {
  /** 发出一次保存：values 是这次操作的全部键值（成组时一次请求）；失败时抛错 */
  send: (values: Record<K, string>) => Promise<void>;
  /** 界面上这个键现在的值（规范成与快照相同的字符串）；没有对应界面时返回 undefined */
  read: (key: K) => string | undefined;
  /** 把原始字符串写回界面 */
  write: (key: K, raw: string) => void;
  /** 一个操作真的发出且成功：saved 是这次的快照，successMessage 是这次操作指定的提示（只在启用时调用） */
  onSuccess?: (saved: Record<K, string>, successMessage?: string) => void;
  /** 页面是否仍在（卸载后不再开始新的操作、不写回、不通知） */
  isActive?: () => boolean;
}

export interface EnqueueOptions<K extends string | number = string> {
  /** 成组：整组一次请求，不因与已确认值相同而跳过 */
  group?: boolean;
  /** 这次操作成功后调用，参数是这次实际确认的快照 */
  onSaved?: (saved: Record<K, string>) => void;
  /** 成功时的提示（不传用默认提示）；被后来的操作合并时以后来的为准 */
  successMessage?: string;
}

interface Operation<K extends string | number> {
  keys: K[];
  values: Record<K, string>;
  group: boolean;
  successMessage?: string;
  onSaved: Array<(saved: Record<K, string>) => void>;
  waiters: Array<(ok: boolean) => void>;
}

export function createConfigSaveScheduler<K extends string | number = string>(
  options: ConfigSaveSchedulerOptions<K>,
) {
  const confirmed = new Map<K, string>();
  const queue: Operation<K>[] = [];
  let inflight: Operation<K> | null = null;
  const isActive = () => options.isActive?.() ?? true;

  const coveredLater = (key: K) => queue.some((op) => op.keys.includes(key));

  const settle = (op: Operation<K>, ok: boolean) => {
    for (const resolve of op.waiters) resolve(ok);
  };

  /** 界面仍显示这次发出的值：可以写回（成功写规范后的值，失败写已确认值） */
  const mayWriteBack = (key: K, sent: string) => !coveredLater(key) && options.read(key) === sent;

  /** 执行一个操作，返回是否成功（调用方在清掉在途标记之后才通知等待者） */
  async function run(op: Operation<K>): Promise<boolean> {
    const values = op.values;
    if (!op.group && op.keys.every((key) => confirmed.get(key) === values[key])) {
      // 与已确认值相同：不发请求，把规范后的值写回界面（例如去掉首尾空格）
      if (isActive()) {
        for (const key of op.keys)
          if (mayWriteBack(key, values[key])) options.write(key, values[key]);
      }
      return true;
    }
    try {
      await options.send(values);
    } catch {
      if (isActive()) {
        for (const key of op.keys) {
          if (mayWriteBack(key, values[key])) options.write(key, confirmed.get(key) ?? '');
        }
      }
      return false;
    }
    for (const key of op.keys) confirmed.set(key, values[key]);
    if (isActive()) {
      for (const key of op.keys)
        if (mayWriteBack(key, values[key])) options.write(key, values[key]);
      // 保存已经成功：页面回调出错不改变结果，也不能卡住后面的保存
      const notify = (callback: () => void) => {
        try {
          callback();
        } catch {
          // 忽略
        }
      };
      notify(() => options.onSuccess?.(values, op.successMessage));
      for (const callback of op.onSaved) notify(() => callback(values));
    }
    return true;
  }

  function pump() {
    if (inflight) return;
    const next = queue.shift();
    if (!next) return;
    if (!isActive()) {
      // 页面已经不在：排队的都不再发
      settle(next, false);
      for (const op of queue.splice(0)) settle(op, false);
      return;
    }
    inflight = next;
    void run(next)
      .catch(() => false)
      .then((ok) => {
        // 先清掉在途标记再通知：等待者据 saving() 判断这个键还有没有后续操作
        inflight = null;
        settle(next, ok);
        pump();
      });
  }

  return {
    /** 加载成功后记下服务端的原始值 */
    init(values: Partial<Record<K, string>>) {
      for (const [key, value] of Object.entries(values) as Array<[K, string | undefined]>) {
        confirmed.set(key, value ?? '');
      }
    },
    /** 外部修正已确认值（例如别处已保存） */
    setConfirmed(key: K, value: string) {
      confirmed.set(key, value);
    },
    confirmedValue(key: K) {
      return confirmed.get(key);
    },
    /** 入队一次保存；返回这次意图最终是否保存成功（被后来的操作完整覆盖时随它的结果） */
    enqueue(values: Record<K, string>, enqueueOptions: EnqueueOptions<K> = {}): Promise<boolean> {
      const keys = Object.keys(values) as K[];
      const op: Operation<K> = {
        keys,
        values: { ...values },
        group: Boolean(enqueueOptions.group),
        successMessage: enqueueOptions.successMessage,
        onSaved: enqueueOptions.onSaved ? [enqueueOptions.onSaved] : [],
        waiters: [],
      };
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const pending = queue[index];
        if (pending.keys.every((key) => keys.includes(key))) {
          queue.splice(index, 1);
          op.waiters.push(...pending.waiters);
          op.onSaved.push(...pending.onSaved);
        }
      }
      const result = new Promise<boolean>((resolve) => op.waiters.push(resolve));
      queue.push(op);
      pump();
      return result;
    },
    /** 这个键有操作在途或排队 */
    saving(key: K) {
      return Boolean(inflight?.keys.includes(key)) || coveredLater(key);
    },
    /** 这个键的最新期望值：覆盖它的最后一个操作的快照，没有则为已确认值 */
    desired(key: K): string | undefined {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (queue[index].keys.includes(key)) return queue[index].values[key];
      }
      if (inflight?.keys.includes(key)) return inflight.values[key];
      return confirmed.get(key);
    },
  };
}
