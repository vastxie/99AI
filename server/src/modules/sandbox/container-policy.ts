import { SandboxOperationError } from './sandbox.port';
import Docker = require('dockerode');
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { SANDBOX_WORKSPACE, SANDBOX_WORKSPACE_SCHEMA } from './sandbox.port';

export const CONTAINER_LABEL = '99agent.sandbox';
export const POLICY_MISMATCH =
  '沙箱配置与当前基线不一致，已拒绝使用；请管理员检查镜像、策略及资源标签。';

export function platformLabels(ownerId: string, instance: string): Record<string, string> {
  return {
    [CONTAINER_LABEL]: 'true',
    [`${CONTAINER_LABEL}.owner`]: ownerId,
    [`${CONTAINER_LABEL}.instance`]: instance,
    [`${CONTAINER_LABEL}.schema`]: SANDBOX_WORKSPACE_SCHEMA,
  };
}

export function containerFingerprint(options: Docker.ContainerCreateOptions): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        schema: SANDBOX_WORKSPACE_SCHEMA,
        image: options.Image,
        user: options.User,
        cwd: options.WorkingDir,
        cmd: options.Cmd,
        env: [...(options.Env || [])].sort(),
        host: options.HostConfig,
      }),
    )
    .digest('hex');
}

/** HostConfig.Mounts 只比较决定隔离的字段；Docker 回显时可能省略 ReadOnly:false */
function normalizedMounts(value: Docker.MountSettings[] | undefined): string[] {
  return (value || [])
    .map(mount =>
      JSON.stringify([
        mount.Type,
        mount.Source,
        mount.Target,
        Boolean(mount.ReadOnly),
        mount.BindOptions?.Propagation ?? '',
      ]),
    )
    .sort();
}

function normalizedSecurity(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return [];
  return value.map(item => (item === 'no-new-privileges:true' ? 'no-new-privileges' : item)).sort();
}

/** 标签只声明意图；实际 inspect 的安全配置也必须逐项相符。 */
export function assertContainerPolicy(
  info: Docker.ContainerInspectInfo,
  expected: Docker.ContainerCreateOptions,
  _unusedVolumeName?: string,
  allowedNetworks?: string[],
): void {
  const actual = info.HostConfig;
  const host = expected.HostConfig!;
  const labels = info.Config?.Labels || {};
  if (
    !actual ||
    info.Image !== expected.Image ||
    info.Path !== expected.Cmd?.[0] ||
    info.Name !== `/${expected.name}` ||
    Object.entries(expected.Labels || {}).some(([key, value]) => labels[key] !== value) ||
    info.Config.User !== expected.User ||
    info.Config.WorkingDir !== expected.WorkingDir ||
    !same(info.Config.Cmd, expected.Cmd) ||
    !same([...(info.Config.Env || [])].sort(), [...(expected.Env || [])].sort()) ||
    (Array.isArray(info.Config.Entrypoint)
      ? info.Config.Entrypoint.length > 0
      : !!info.Config.Entrypoint)
  ) {
    throw new SandboxOperationError(POLICY_MISMATCH);
  }
  for (const key of [
    'Runtime',
    'NetworkMode',
    'Memory',
    'MemorySwap',
    'NanoCpus',
    'PidsLimit',
    'ReadonlyRootfs',
    'Init',
    'IpcMode',
    'ShmSize',
  ] as const) {
    if (actual[key] !== host[key]) throw new SandboxOperationError(POLICY_MISMATCH);
  }
  if (
    actual.Privileged ||
    actual.PublishAllPorts ||
    actual.AutoRemove ||
    actual.OomKillDisable ||
    actual.PidMode ||
    actual.UTSMode ||
    actual.UsernsMode === 'host' ||
    actual.CapAdd?.length ||
    actual.Devices?.length ||
    actual.DeviceRequests?.length ||
    actual.VolumesFrom?.length ||
    actual.GroupAdd?.length ||
    actual.Links?.length ||
    !same(actual.Dns || [], host.Dns || []) ||
    Object.keys(actual.PortBindings || {}).length ||
    !same([...(actual.CapDrop || [])].sort(), ['ALL']) ||
    !same(normalizedSecurity(actual.SecurityOpt), ['no-new-privileges']) ||
    !same(actual.Tmpfs, host.Tmpfs) ||
    actual.RestartPolicy?.Name !== 'no' ||
    actual.LogConfig?.Type !== 'none' ||
    !same(actual.Binds, host.Binds) ||
    !same(normalizedMounts(actual.Mounts), normalizedMounts(host.Mounts))
  ) {
    throw new SandboxOperationError(POLICY_MISMATCH);
  }
  // 临时沙箱只有 tmpfs；持久沙箱额外恰好一个可写绑定：该用户磁盘的 workspace/ → /workspace
  const binds = (host.Mounts || []).filter(mount => mount.Type === 'bind');
  const persistent = (info.Mounts || []).filter(mount => mount.Type !== 'tmpfs');
  if (
    binds.some(mount => mount.Target !== SANDBOX_WORKSPACE || mount.ReadOnly) ||
    persistent.length !== binds.length ||
    persistent.some(
      mount =>
        mount.Type !== 'bind' ||
        mount.Destination !== SANDBOX_WORKSPACE ||
        mount.RW !== true ||
        !binds.some(bind => bind.Source === mount.Source),
    ) ||
    (info.Mounts || []).some(mount => ![SANDBOX_WORKSPACE, '/tmp'].includes(mount.Destination))
  ) {
    throw new SandboxOperationError(POLICY_MISMATCH);
  }
  const networks = Object.keys(info.NetworkSettings?.Networks || {});
  if (!same(networks.sort(), (allowedNetworks || [host.NetworkMode]).sort()))
    throw new SandboxOperationError(POLICY_MISMATCH);
}
