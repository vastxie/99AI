import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import i18n from '@/locales'
import { useChatStore } from '@/store/modules/chat'
import List from './List.vue'

vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ hash: '', params: {}, name: 'Chat' }),
}))

const GID = 'g_abcdefghijklmnopqrstuvwx'
let wrapper: VueWrapper | undefined

async function renameUntitledConversation(input: string | null) {
  const chatStore = useChatStore()
  chatStore.groupList = [{ uuid: GID, title: '', isSticky: false, config: '{}' } as any]
  const update = vi
    .spyOn(chatStore, 'updateConversationGroup')
    .mockResolvedValue(undefined as never)
  wrapper = mount(List, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: { PackSlot: true, transition: false },
    },
  })
  await wrapper.get('.conversation-more').trigger('click')
  await nextTick()
  // 菜单浮层挂在 body 上
  const renameItem = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).find(item => item.textContent?.trim() === i18n.global.t('chat.rename'))
  expect(renameItem, '重命名菜单项').toBeTruthy()
  renameItem!.click()
  await nextTick()
  const field = wrapper.get('input')
  expect((field.element as HTMLInputElement).value).toBe(i18n.global.t('common.newConversation'))
  if (input !== null) await field.setValue(input)
  await field.trigger('keydown', { key: 'Enter' })
  await nextTick()
  return update
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('未命名会话重命名', () => {
  it('输入框里预填的「新对话」原样确认：当作没改，不把兜底文案写进服务端', async () => {
    const update = await renameUntitledConversation(null)
    expect(update).not.toHaveBeenCalled()
    expect(wrapper!.find('input').exists()).toBe(false)
  })

  it('改成新标题才提交', async () => {
    const update = await renameUntitledConversation('  周报整理  ')
    expect(update).toHaveBeenCalledWith(GID, { title: '周报整理' })
  })
})
