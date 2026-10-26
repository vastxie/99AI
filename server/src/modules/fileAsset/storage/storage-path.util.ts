import * as path from 'path';

export function normalizeObjectKey(objectKey: string): string {
  const normalized = String(objectKey || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .join('/');

  if (!normalized) {
    throw new Error('objectKey 不能为空');
  }

  const segments = normalized.split('/');
  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error('objectKey 包含非法路径片段');
  }

  return normalized;
}

export function resolveStoragePath(rootDir: string, objectKey: string): string {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedObjectKey = normalizeObjectKey(objectKey);
  const filePath = path.resolve(normalizedRoot, normalizedObjectKey);

  if (filePath !== normalizedRoot && !filePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error('objectKey 越过存储根目录');
  }

  return filePath;
}

export function encodeObjectKeyForUrl(objectKey: string): string {
  return normalizeObjectKey(objectKey)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}
