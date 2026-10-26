import ConfirmDialog from '@/components/Dialog/Confirm.vue'
import { createVNode, render } from 'vue'

export interface DialogOptions {
  title: string
  content: string
  positiveText?: string
  negativeText?: string
  /** danger：确认按钮用危险色，用于删除、退出登录这类不可撤销的操作 */
  tone?: 'default' | 'danger'
  /** 确认后执行的动作：执行期间弹窗不能关闭；失败时弹窗留着、结果为 false */
  onPositiveClick?: () => Promise<void> | void
}

let instance: { showDialog: (options: DialogOptions) => Promise<boolean> } | null = null

function getInstance() {
  if (!instance) {
    const container = document.createElement('div')
    const vnode = createVNode(ConfirmDialog)
    render(vnode, container)
    document.body.appendChild(container)
    const exposed = vnode.component?.exposed as
      { showDialog: (options: DialogOptions) => Promise<boolean> } | undefined
    if (!exposed) throw new Error('Dialog instance is not ready')
    instance = exposed
  }
  return instance
}

/**
 * 弹出确认框：用户确认（且确认动作成功）时为 true；取消、被新弹窗顶替或确认动作失败时为 false。
 * 取消是正常结果，不以异常表示，调用方不需要 catch。
 */
export function confirmDialog(options: DialogOptions): Promise<boolean> {
  return getInstance().showDialog(options)
}
