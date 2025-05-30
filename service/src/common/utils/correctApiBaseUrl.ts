/**
 * 规范化API基础URL
 * @param baseUrl - 需要规范化的API基础URL
 * @returns 规范化后的URL字符串
 */
export async function correctApiBaseUrl(baseUrl: string) {
  if (!baseUrl) return '';

  // 去除两端空格
  let url = baseUrl.trim();

  // 如果URL以斜杠'/'结尾，则移除这个斜杠
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // 检查URL是否已包含任何版本标记，包括常见的模式如/v1, /v1beta, /v1alpha等
  if (!/\/v\d+(?:beta|alpha)?/.test(url)) {
    // 如果不包含任何版本号，添加 /v1
    return `${url}/v1`;
  }

  return url;
}
