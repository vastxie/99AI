import Message from '@/components/Message/index.vue'
import { createVNode, render } from 'vue'

export interface MessageOptions {
  type?: 'success' | 'error' | 'warning' | 'info'
  content: string
  duration?: number
}

// 创建一个单例模式的message实例
let messageInstance: any = null

export function message() {
  // 如果已经创建了实例，直接返回
  if (messageInstance) {
    return messageInstance
  }

  const container = document.createElement('div')
  container.setAttribute('class', 'message-container')
  document.body.appendChild(container)

  const vnode = createVNode(Message)
  render(vnode, container)

  const msg = vnode.component?.exposed as {
    show: (options: MessageOptions) => void
  }

  messageInstance = {
    success(content: string, options?: Partial<MessageOptions>) {
      msg.show({ type: 'success', content, ...options })
    },
    error(content: string, options?: Partial<MessageOptions>) {
      msg.show({ type: 'error', content, ...options })
    },
    warning(content: string, options?: Partial<MessageOptions>) {
      msg.show({ type: 'warning', content, ...options })
    },
    info(content: string, options?: Partial<MessageOptions>) {
      msg.show({ type: 'info', content, ...options })
    },
    // 提供清理方法
    destroy() {
      render(null, container)
      document.body.removeChild(container)
      messageInstance = null
    },
  }

  return messageInstance
}
