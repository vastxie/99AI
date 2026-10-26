import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwtAuth.guard';

/** 文件访问鉴权 cookie 名，由前端按登录态同步，Path 限定在文件 API 前缀下 */
export const FILE_ACCESS_TOKEN_COOKIE = 'fa_token';

export function getCookieValue(cookieHeader: unknown, name: string): string | null {
  if (typeof cookieHeader !== 'string' || !cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) continue;
    if (part.slice(0, separatorIndex).trim() !== name) continue;
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

/**
 * 文件访问专用鉴权：Bearer 头优先，回退到 fa_token cookie。
 *
 * 仅用于 <img> / <video> 等无法携带请求头的媒体标签直链场景（私有文件预览/下载）。
 * 这样前端可以使用普通 URL 作为媒体源：链接本身不携带任何凭证，
 * 访问权完全取决于浏览器会话里的 cookie——复制分享出去的链接对他人天然不可用。
 * 不扩大其余 API 的鉴权面：其他控制器继续使用仅认 Bearer 的 JwtAuthGuard。
 */
@Injectable()
export class FileAccessAuthGuard extends JwtAuthGuard {
  protected extractToken(request: Request) {
    return (
      super.extractToken(request) ??
      getCookieValue(request?.headers?.cookie, FILE_ACCESS_TOKEN_COOKIE)
    );
  }
}
