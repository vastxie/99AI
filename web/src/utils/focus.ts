/**
 * 表单校验没过：焦点移到第一个出错的字段上。读屏随之读出字段名和它的错误说明
 * （aria-describedby），同样的错误再次提交也会重新读到，不必等播报区的文字变化
 */
export function focusFirstInvalidField(root: HTMLElement | null | undefined) {
  root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}
