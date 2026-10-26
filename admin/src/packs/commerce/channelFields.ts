/** 支付参数字段在界面上的值：加载与失败回滚共用——没配置过（空串）时显示字段的默认选项 */
export function channelFieldValue(raw: unknown, defaultValue?: string): string {
  const value = raw === null || raw === undefined ? '' : String(raw);
  return value || defaultValue || '';
}
