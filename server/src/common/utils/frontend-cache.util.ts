/**
 * 前端构建产物（用户端与管理端）的缓存策略。
 *
 * 构建时文件名带内容哈希（assets/、css/、fonts/、mjs/、images/ 下的 name-hash.ext）：内容变了文件名就变，
 * 可以让浏览器长期缓存、不再回源验证；入口 index.html 与不带哈希的文件（第三方运行时资源、favicon 等）每次协商，
 * 发版后立即拿到新入口。
 *
 * 哈希固定 8 位（base64url，可含 - 和 _），且至少有一个大写字母或数字：images/ 同时放着 public/ 原样拷贝、
 * 不带哈希的图片，foo-background.png、app-icon-maskable.png 这类文件名不能被当成哈希缓存一年。
 * 判不准时宁可每次协商（只多一次 304），不能长期缓存旧文件。
 */
const HASHED_FRONTEND_ASSET =
  /\/(?:assets|css|fonts|mjs|images)\/[^/]+-(?=[A-Za-z0-9_-]{0,7}[A-Z0-9])[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const REVALIDATE_CACHE_CONTROL = 'no-cache';

export function frontendCacheControl(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/');
  return HASHED_FRONTEND_ASSET.test(normalized)
    ? IMMUTABLE_CACHE_CONTROL
    : REVALIDATE_CACHE_CONTROL;
}
