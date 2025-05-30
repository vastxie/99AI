import ConfirmDialog from '@/components/Dialog/Confirm.vue'
import { createVNode, render } from 'vue'

export interface DialogOptions {
  title: string
  content: string
  positiveText?: string
  negativeText?: string
  onPositiveClick?: () => Promise<void> | void
}

export function dialog() {
  const container = document.createElement('div')

  const vnode = createVNode(ConfirmDialog)
  render(vnode, container)
  document.body.appendChild(container)

  const dialog = vnode.component?.exposed as {
    showDialog: (options: DialogOptions) => Promise<boolean>
  }

  return {
    warning: async (options: DialogOptions) => {
      try {
        const confirmed = await dialog.showDialog(options)
        if (confirmed) {
          return Promise.resolve()
        }
        return Promise.reject()
      } finally {
        render(null, container)
        container.remove()
      }
    },
  }
}
