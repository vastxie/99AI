/**
 * SandboxModule — 用户沙箱（Docker + gVisor）
 *
 * 环境变量见 .env.example「沙箱」段。生产环境只允许 docker 驱动；
 * local 驱动没有隔离，只用于开发与测试。
 */

import { Module } from '@nestjs/common';
import * as path from 'node:path';
import { DockerSandboxDriver } from './docker-sandbox.driver';
import { LocalSandboxDriver } from './local-sandbox.driver';
import { SandboxDiskManager } from './sandbox-disk';
import { SANDBOX_DRIVER, type SandboxDriver } from './sandbox.port';
import {
  SANDBOX_DEFAULT_POLICY,
  SandboxService,
  readSandboxPolicyFromEnv,
} from './sandbox.service';

const DEFAULT_DISK_COMMAND = '/usr/local/sbin/99agent-sandbox-disk';

/**
 * 登录用户工作区：disk = 每人一块持久磁盘（需宿主助手），tmpfs = 临时工作区。
 * 生产环境默认 disk 且缺配置时拒绝启动，临时模式必须显式选择，避免漏配后静默丢数据。
 * 选 tmpfs 但仍配置了磁盘根目录时保留磁盘管理，只用来卸载切换前留下的用户磁盘。
 */
function createUserDisk(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
  namePrefix: string,
): { disk?: SandboxDiskManager; persistentUsers: boolean } {
  const root = String(env.SANDBOX_USER_DISK_ROOT || '').trim();
  const storage = String(env.SANDBOX_USER_STORAGE || '')
    .trim()
    .toLowerCase();
  if (storage && storage !== 'disk' && storage !== 'tmpfs')
    throw new Error(`未知的 SANDBOX_USER_STORAGE：${storage}（支持 disk / tmpfs）`);
  const mode = storage || (isProduction || root ? 'disk' : 'tmpfs');
  if (!root) {
    if (mode === 'tmpfs') return { persistentUsers: false };
    throw new Error(
      '登录用户沙箱使用持久磁盘：请按 sandbox/README.md 安装磁盘助手并设置 SANDBOX_USER_DISK_ROOT，' +
        '或显式设置 SANDBOX_USER_STORAGE=tmpfs 使用临时工作区',
    );
  }
  if (env.SANDBOX_DOCKER_HOST)
    throw new Error('持久磁盘需要本机 Docker（Unix socket），不能与 SANDBOX_DOCKER_HOST 同用');
  const hostMinFreeMb = Number(env.SANDBOX_USER_DISK_HOST_MIN_FREE_MB || 10240);
  if (!Number.isFinite(hostMinFreeMb) || hostMinFreeMb < 0)
    throw new Error('SANDBOX_USER_DISK_HOST_MIN_FREE_MB 必须是非负数');
  return {
    disk: new SandboxDiskManager({
      root,
      command: String(env.SANDBOX_USER_DISK_COMMAND || DEFAULT_DISK_COMMAND).trim(),
      instance: namePrefix,
      hostMinFreeBytes: hostMinFreeMb * 1024 * 1024,
    }),
    persistentUsers: mode === 'disk',
  };
}

export function createSandboxDriverFromEnv(env: NodeJS.ProcessEnv = process.env): SandboxDriver {
  const kind = (env.SANDBOX_DRIVER || 'docker').trim().toLowerCase();
  const nodeEnvironment = String(env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  const developmentFlag = String(env.ISDEV || '')
    .trim()
    .toLowerCase();
  // 标准 PM2 部署使用 ISDEV=false；未明确选择开发/测试也按生产保护。
  const isProduction =
    nodeEnvironment === 'production' ||
    developmentFlag === 'false' ||
    (developmentFlag !== 'true' && nodeEnvironment !== 'development' && nodeEnvironment !== 'test');

  if (kind === 'local') {
    if (isProduction) {
      throw new Error('SANDBOX_DRIVER=local 没有隔离，生产环境禁止使用');
    }
    return new LocalSandboxDriver(path.resolve(env.SANDBOX_LOCAL_ROOT || 'data/sandboxes'));
  }

  if (kind === 'docker') {
    const runtime =
      env.SANDBOX_DOCKER_RUNTIME !== undefined
        ? env.SANDBOX_DOCKER_RUNTIME.trim()
        : isProduction
          ? 'runsc'
          : '';
    if (isProduction && runtime !== 'runsc') throw new Error('生产沙箱必须使用 runsc');
    const namePrefix = env.SANDBOX_NAME_PREFIX || '99agent-sbx-';
    const userDisk = createUserDisk(env, isProduction, namePrefix);
    return new DockerSandboxDriver({
      socketPath: env.SANDBOX_DOCKER_SOCKET || undefined,
      host: env.SANDBOX_DOCKER_HOST || undefined,
      port: env.SANDBOX_DOCKER_PORT ? Number(env.SANDBOX_DOCKER_PORT) : undefined,
      runtime: runtime || undefined,
      egressImage: env.SANDBOX_EGRESS_IMAGE || undefined,
      egressAllowHosts: env.SANDBOX_EGRESS_ALLOW_HOSTS || undefined,
      egressDenyHosts: env.SANDBOX_EGRESS_DENY_HOSTS || undefined,
      image: env.SANDBOX_IMAGE || '99agent/sandbox:latest',
      namePrefix,
      user: env.SANDBOX_USER || 'sandbox',
      init: String(env.SANDBOX_DOCKER_INIT || 'true').toLowerCase() !== 'false',
      disk: userDisk.disk,
      persistentUsers: userDisk.persistentUsers,
    });
  }

  throw new Error(`未知的 SANDBOX_DRIVER：${kind}（支持 docker / local）`);
}

@Module({
  providers: [
    { provide: SANDBOX_DRIVER, useFactory: () => createSandboxDriverFromEnv() },
    { provide: SANDBOX_DEFAULT_POLICY, useFactory: () => readSandboxPolicyFromEnv() },
    SandboxService,
  ],
  exports: [SandboxService, SANDBOX_DRIVER],
})
export class SandboxModule {}
