import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { ChatLogStatus } from '@/constants/chatLogStatus'
import { useChatStore } from '@/store/modules/chat'
import { useConversationSwitchTransition } from './useConversationSwitchTransition'

const GID = 'g_aaaaaaaaaaaaaaaaaaaaaaaa'
let wrapper: VueWrapper | undefined

function mountTransition() {
  let transition!: ReturnType<typeof useConversationSwitchTransition>
  wrapper = mount(
    defineComponent({
      setup() {
        transition = useConversationSwitchTransition({
          scrollRef: ref<HTMLDivElement | null>(null),
          isConversationLoading: computed(() => false),
          activeWorkspaceId: computed(() => GID),
          hasActivePendingFocus: () => false,
        })
        return () => null
      },
    })
  )
  return transition
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('会话切换时的画布', () => {
  it('首屏的一页还在取（本地没有消息）时先藏起来；本地已经有消息时的后台刷新不藏', () => {
    const chatStore = useChatStore()
    chatStore.active = GID
    chatStore.messagePaginationByWorkspace[GID] = {
      initialized: false,
      loading: true,
      hasMore: true,
      beforeCursor: null,
    }
    expect(mountTransition().isCanvasSwitching.value).toBe(true)
    wrapper?.unmount()

    // 首屏的一页没取到时插进来的一轮还在：再取一次时不当成首屏加载
    chatStore.messageCacheByWorkspace[GID] = [
      { cid: 'q9', role: 'user', content: 'q9' },
      { cid: 'a9', role: 'assistant', content: 'a9', status: ChatLogStatus.COMPLETED },
    ] as Chat.Chat[]
    expect(mountTransition().isCanvasSwitching.value).toBe(false)
  })
})
