/**
 * MCP 页面的保存规则（纯逻辑，供页面与测试共用）：
 * - 只有成功加载过、没有正在刷新、最近一次刷新没有失败、也没有保存在途时才允许新增、编辑、启停、删除；
 *   否则「以空列表为底整表保存」会清掉后台已有的服务器，刷新回来的新快照也会配上旧列表；
 * - 每次保存都以最近一次成功的 GET / PUT 返回的快照为底：列表、修订号与「丢弃无法解析的条目」的确认
 *   都来自发起时的同一份快照，确认期间快照变了就放弃；
 * - 编辑弹窗打开后快照变了（刷新、别的保存），提交时不再用旧表单覆盖。
 */
export interface McpPageLoadState {
  loaded: boolean;
  loading: boolean;
  loadFailed: boolean;
  saving: boolean;
}

export function canMutateMcpServers(state: McpPageLoadState): boolean {
  return state.loaded && !state.loading && !state.loadFailed && !state.saving;
}

/** 弹窗打开时记下的修订号与当前快照的不一致：说明期间刷新或保存过，旧表单不能再提交 */
export function isMcpDialogStale(dialogRevision: string | null, currentRevision: string): boolean {
  return dialogRevision !== currentRevision;
}

/** PUT 请求体：带快照的修订号；存储里有无法解析的条目且已确认丢弃时带 discardInvalid */
export function buildMcpSaveBody<T>(
  servers: T[],
  snapshot: { revision: string; storedErrors: string[] },
  discardConfirmed: boolean,
): { servers: T[]; revision: string; discardInvalid?: boolean } {
  return {
    servers,
    revision: snapshot.revision,
    ...(snapshot.storedErrors.length && discardConfirmed ? { discardInvalid: true } : {}),
  };
}

export interface McpSnapshot {
  revision: string;
  storedErrors: string[];
}

export type McpSaveOutcome<V> =
  { status: 'saved'; view: V } | { status: 'cancelled' } | { status: 'stale' };

/**
 * 以发起时的快照整表保存：build 按这份快照生成列表，修订号与坏条目确认也来自它。
 * 存储里有无法解析的条目时先确认丢弃（拒绝 → cancelled）；确认期间快照变了（刷新、别的保存）→ stale，
 * 不把旧列表配上新修订号提交。send 失败照常抛出（409 等由调用方处理）
 */
export async function saveFromSnapshot<V extends McpSnapshot, T>(options: {
  current: () => V;
  build: (snapshot: V) => T[];
  confirmDiscard: (storedErrors: string[]) => Promise<boolean>;
  send: (body: { servers: T[]; revision: string; discardInvalid?: boolean }) => Promise<V>;
}): Promise<McpSaveOutcome<V>> {
  const snapshot = options.current();
  const servers = options.build(snapshot);
  let discardConfirmed = false;
  if (snapshot.storedErrors.length) {
    if (!(await options.confirmDiscard(snapshot.storedErrors))) return { status: 'cancelled' };
    if (options.current() !== snapshot) return { status: 'stale' };
    discardConfirmed = true;
  }
  const view = await options.send(buildMcpSaveBody(servers, snapshot, discardConfirmed));
  return { status: 'saved', view };
}
