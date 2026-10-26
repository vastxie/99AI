/**
 * 删除若干行后计算应停留的页码：
 * 若当前页在删除后已越界（如删掉末页最后一条），回退到最后一个非空页。
 */
export function resolvePageAfterRemoval(
  page: number,
  size: number,
  total: number,
  removed = 1,
): number {
  const remaining = Math.max(0, total - removed);
  const lastPage = Math.max(1, Math.ceil(remaining / size));
  return Math.min(page, lastPage);
}
