/**
 * 运行环境判定：安全相关的默认值一律「按生产处理」，只有显式声明开发 / 测试才放宽。
 *
 * - 生产：NODE_ENV=production，或 ISDEV=false，或既没声明开发也没声明测试；
 * - 开发 / 测试：NODE_ENV=development / test，或 ISDEV=true。
 * 与 sandbox.module 的驱动选择口径一致。
 */
export function isDevelopmentRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnvironment = String(env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  const developmentFlag = String(env.ISDEV || '')
    .trim()
    .toLowerCase();
  if (nodeEnvironment === 'production' || developmentFlag === 'false') return false;
  return (
    developmentFlag === 'true' || nodeEnvironment === 'development' || nodeEnvironment === 'test'
  );
}

/** 生产部署缺少显式 NODE_ENV=production 时的提示（bcrypt 强度、CORS、沙箱驱动都按生产处理，但仍建议显式声明） */
export function describeRuntimeEnvironmentWarning(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const nodeEnvironment = String(env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  if (nodeEnvironment === 'production') return null;
  if (isDevelopmentRuntime(env)) {
    return '当前以开发 / 测试环境运行（NODE_ENV / ISDEV 显式声明）：bcrypt 强度降低、允许 localhost 跨域、允许 local 沙箱驱动，请勿用于对外服务。';
  }
  return '未显式设置 NODE_ENV=production：安全默认值已按生产处理，仍建议在 pm2 / .env 中显式声明以避免依赖库按开发模式运行。';
}
