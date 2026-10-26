/**
 * 格式化 URL，移除末尾的斜杠
 * @param url - 需要格式化的 URL
 * @returns 格式化后的 URL
 */
export function formatUrl(url: string): string {
  if (!url) return '';
  return url.replace(/\/+$/, '');
}
