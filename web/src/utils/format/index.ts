const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * 格式化文件大小（全站唯一实现）。
 *
 * 此前待发送附件卡、消息文件卡与文件工作台各有一份，舍入规则和单位上限都不同：
 * 同一个文件在三处可能显示成 "5 MB" / "5.0 MB"，1GB 甚至会显示成 "1024 MB"。
 *
 * @param size 字节数；非法值或负数返回空串，便于调用方直接过滤掉
 */
export function formatFileSize(size?: number | null): string {
  const value = Number(size)
  if (!Number.isFinite(value) || value < 0) return ''
  if (value === 0) return '0 B'

  let current = value
  let index = 0
  while (current >= 1024 && index < FILE_SIZE_UNITS.length - 1) {
    current /= 1024
    index += 1
  }

  const digits = current >= 10 || index === 0 ? 0 : 1
  return `${current.toFixed(digits)} ${FILE_SIZE_UNITS[index]}`
}
