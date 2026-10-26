/**
 * 同一类请求只认最后发出的那次（分页表格、远端选项、配置状态复查共用）：
 * begin() 发请求前取序号，回来时 isLatest(序号) 为真才落地；invalidate() 让在途的全部作废（卸载、重置、换值）
 */
export function createLatestGate() {
  let seq = 0;
  return {
    begin: () => {
      seq += 1;
      return seq;
    },
    isLatest: (token: number) => token === seq,
    invalidate: () => {
      seq += 1;
    },
  };
}

/**
 * 只认最后一次的异步取数（候选、标签）：被更新的 run 取代、或 invalidate 之后，晚到的结果不写；
 * invalidate（重置、换值、卸载）同时收起加载态。失败吞掉（请求层已提示）
 */
export function createLatestLoader<T>(handlers: {
  apply: (value: T) => void;
  setLoading?: (loading: boolean) => void;
}) {
  const gate = createLatestGate();
  return {
    async run(fetch: () => Promise<T>) {
      const token = gate.begin();
      handlers.setLoading?.(true);
      try {
        const value = await fetch();
        if (gate.isLatest(token)) handlers.apply(value);
      } catch {
        // 请求层已提示
      } finally {
        if (gate.isLatest(token)) handlers.setLoading?.(false);
      }
    },
    invalidate() {
      gate.invalidate();
      handlers.setLoading?.(false);
    },
  };
}

export type LatestLoader<T> = ReturnType<typeof createLatestLoader<T>>;
