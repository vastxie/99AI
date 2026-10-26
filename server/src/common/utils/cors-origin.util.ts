import { Logger } from '@nestjs/common';
import { isDevelopmentRuntime } from './runtime-env.util';

const LOCAL_DEV_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

export interface CorsOriginOptions {
  siteUrl?: string | null;
  nodeEnv?: string;
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '*') return null;

  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveCorsAllowedOrigins(options: CorsOriginOptions = {}): string[] {
  const candidates = [options.siteUrl || '', process.env.SITE_URL || ''];

  return Array.from(
    new Set(candidates.map(item => normalizeOrigin(item)).filter((item): item is string => !!item)),
  );
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  nodeEnv = process.env.NODE_ENV,
): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (allowedOrigins.includes(normalized)) return true;
  // localhost 只在显式声明的开发 / 测试环境放行；未设置 NODE_ENV 时按生产处理
  if (
    isDevelopmentRuntime({ NODE_ENV: nodeEnv, ISDEV: process.env.ISDEV }) &&
    LOCAL_DEV_ORIGIN.test(normalized)
  ) {
    return true;
  }
  return false;
}

export function createCorsOriginDelegate(allowedOrigins: string[], nodeEnv = process.env.NODE_ENV) {
  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowed = isCorsOriginAllowed(origin, allowedOrigins, nodeEnv);
    if (!allowed && origin) {
      Logger.warn(`CORS 拒绝未授权来源: ${origin}`, 'CorsOrigin');
    }
    callback(null, allowed);
  };
}
