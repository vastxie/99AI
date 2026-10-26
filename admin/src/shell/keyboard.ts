/** 事件目标是否是正在输入的地方（输入框、文本域、下拉框、可编辑区域）：全局快捷键在这些地方不响应 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
