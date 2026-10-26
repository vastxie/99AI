import Message from '@/components/Message/index.vue'
import { createVNode, render } from 'vue'

export interface MessageOptions {
  type?: 'success' | 'error' | 'warning' | 'info'
  content: string
  duration?: number
}

// 创建一个单例模式的message实例
let messageInstance: any = null

/** 错误里给用户看的原因（请求层的错误带着服务端文案）；没有时用 fallback */
export function reasonOf(error: unknown, fallback: string): string {
  return (error as { message?: string } | null)?.message || fallback
}

/**
 * 失败提示只出现一次：请求层已经提示过原因的错误（带 notified 标记）不再提示；
 * 其余错误（业务码失败、本地异常）提示调用方给的文案
 */
export function notifyError(error: unknown, fallback: string) {
  if ((error as { notified?: boolean } | null)?.notified) return
  message().error(fallback)
}

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
