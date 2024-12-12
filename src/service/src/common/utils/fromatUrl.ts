export function formatUrl(url: string): string {
  // 去除空格
  let formattedUrl = url.replace(/\s+/g, '');

  // 去除最后一位的 '/'，如果有的话
  if (formattedUrl.endsWith('/')) {
    formattedUrl = formattedUrl.slice(0, -1);
  }

  return formattedUrl;
}
