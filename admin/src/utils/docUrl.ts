/**
 * 生成文档链接
 * @param path 文档路径，如 '/configuration/platform/base-configuration'
 * @returns 完整的文档 URL
 */
export function getDocUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_DOC_URL || 'http://localhost:9005';
  return `${baseUrl}${path}.html`;
}
