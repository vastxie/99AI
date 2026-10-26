import * as path from 'path';
import { FILE_ID_PATTERN } from '@/common/constants/id-pattern.constant';

export type FileSourceKind =
  'file_id' | 'internal_file_url' | 'public_file' | 'external_url' | 'data_url';

export interface FileSourceResolution {
  kind: FileSourceKind;
  source: string;
  fileId?: string;
  url?: URL;
  pathname?: string;
  dataUrl?: string;
}

export interface ResolveFileSourceOptions {
  siteUrl?: string | null;
}

const INTERNAL_FILE_PATH_PATTERN = /^\/api\/files\/(file_[A-Za-z0-9]{24})\/(?:preview|download)$/;

export function isFileAssetId(value: string): boolean {
  return FILE_ID_PATTERN.test(value.trim());
}

export function isDevLoopbackImageHost(url: URL): boolean {
  if (process.env.ISDEV !== 'true' && process.env.NODE_ENV !== 'development') {
    return false;
  }

  return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
}

export function resolveFileSource(
  rawSource: string,
  options: ResolveFileSourceOptions = {},
): FileSourceResolution {
  const source = String(rawSource || '').trim();

  if (!source) {
    throw new Error('文件地址不能为空');
  }

  if (source.startsWith('data:')) {
    return {
      kind: 'data_url',
      source,
      dataUrl: source,
    };
  }

  if (isFileAssetId(source)) {
    return {
      kind: 'file_id',
      source,
      fileId: source,
    };
  }

  const internalFileId = extractInternalFileId(source);
  if (internalFileId) {
    return {
      kind: 'internal_file_url',
      source,
      fileId: internalFileId,
    };
  }

  const normalizedPublicPath = normalizePublicFilePath(source);
  if (normalizedPublicPath) {
    return {
      kind: 'public_file',
      source,
      pathname: normalizedPublicPath,
    };
  }

  try {
    const url = new URL(source);

    const urlInternalFileId = extractInternalFileId(url.pathname);
    if (urlInternalFileId && isTrustedInternalFileHost(url, options)) {
      return {
        kind: 'internal_file_url',
        source,
        fileId: urlInternalFileId,
        url,
      };
    }

    if (url.pathname.startsWith('/file/') && isDevLoopbackImageHost(url)) {
      return {
        kind: 'public_file',
        source,
        url,
        pathname: url.pathname,
      };
    }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return {
        kind: 'external_url',
        source,
        url,
      };
    }
  } catch {
    // Continue to the unsupported-source error below.
  }

  throw new Error('不支持的文件来源');
}

export function resolveLocalPublicFilePath(
  publicPath: string,
  publicRootDir?: string | null,
): string {
  const pathname = normalizePublicFilePath(publicPath);
  if (!pathname) {
    throw new Error('仅支持 /file/ 下的公开文件');
  }

  const decodedPathname = decodeURIComponent(pathname);
  const relativePath = decodedPathname.replace(/^\/file\//, '');
  const publicRoot = path.resolve(
    String(publicRootDir || '').trim() || path.join(process.cwd(), 'public/file'),
  );
  const fullPath = path.resolve(publicRoot, relativePath);

  if (!fullPath.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error('非法文件路径');
  }

  return fullPath;
}

function extractInternalFileId(source: string): string | null {
  const match = source.match(INTERNAL_FILE_PATH_PATTERN);
  return match?.[1] || null;
}

function normalizePublicFilePath(source: string): string | null {
  if (source.startsWith('/file/')) {
    return source;
  }

  if (source.startsWith('file/')) {
    return `/${source}`;
  }

  return null;
}

function isTrustedInternalFileHost(url: URL, options: ResolveFileSourceOptions): boolean {
  const siteUrl = String(options.siteUrl || '').trim();
  if (siteUrl) {
    try {
      const parsedSiteUrl = new URL(siteUrl);
      if (
        parsedSiteUrl.protocol === url.protocol &&
        parsedSiteUrl.hostname === url.hostname &&
        parsedSiteUrl.port === url.port
      ) {
        return true;
      }
    } catch {
      // Invalid siteUrl should not open the internal FileAsset shortcut.
    }
  }

  return isDevLoopbackImageHost(url);
}
