<script setup lang="ts">
import ActionIcon from '@/components/common/ActionIcon/index.vue'
import DropdownMenu, { MenuItem } from '@/components/common/DropdownMenu'
import ScrollShadow from '@/components/common/ScrollShadow/index.vue'
import PackSlot from '@/components/common/PackSlot.vue'
import UiButton from '@/components/common/UiButton.vue'
import UiStateView from '@/components/common/UiStateView.vue'
import { useViewport } from '@/hooks/useViewport'
import { t } from '@/locales'
import { useAuthStore } from '@/store/modules/auth'
import { useChatStore } from '@/store/modules/chat'
import { confirmDialog } from '@/utils/dialog'
import { message } from '@/utils/message'
import { Ellipsis, Pencil, Pin, PinOff, Trash2 } from '@lucide/vue'
import { useConversationNavigator } from '../../composables/useConversationNavigator'
import SidebarIcon from './SidebarIcon.vue'
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'

const { isMobile } = useViewport()
const chatStore = useChatStore()
const authStore = useAuthStore()
const ms = message()
const navigation = useConversationNavigator()

const conversationMenuStates = ref<Record<string, boolean>>({})
const renamingConversationId = ref('')
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
const renameSubmitting = ref(false)
const conversationScrollRef = ref<InstanceType<typeof ScrollShadow> | null>(null)
const isConversationListScrolled = computed(() =>
  Boolean(conversationScrollRef.value?.canScrollStart)
)
const conversationGroups = computed(() => chatStore.getSidebarGroupList())
const showConversationList = computed(() => conversationGroups.value.length > 0)
/** 列表还没有内容时的状态：加载中、拉取失败（可重试）、确实没有会话 */
const listState = computed<'loading' | 'error' | 'empty' | null>(() => {
  if (conversationGroups.value.length) return null
  const pagination = chatStore.groupPagination
  if (pagination.failed) return 'error'
  if (!pagination.initialized) return pagination.loading ? 'loading' : null
  return 'empty'
})
/**
 * 点了状态块里的重试：列表出来后焦点落到第一条会话（状态块随之移除，焦点不掉回页面开头）；
 * 等待期间用户已把焦点移到别处就不动
 */
async function retryConversationList() {
  await chatStore.queryMyGroup()
  await nextTick()
  if (listState.value !== null) return
  if (document.activeElement && document.activeElement !== document.body) return
  const listRoot = conversationScrollRef.value?.$el as HTMLElement | undefined
  listRoot?.querySelector<HTMLElement>('.chat-sidebar-conversation-open')?.focus()
}

const listStateMessage = computed(() => {
  if (listState.value === 'error') return t('chat.conversationListFailed')
  if (listState.value === 'empty') return t('chat.conversationListEmpty')
  return ''
})

// 切到的会话在列表里看不见时滚到可见处（从搜索、别处链接打开时）
watch(
  () => chatStore.active,
  id => {
    if (!id) return
    void nextTick(() => {
      document
        .querySelector<HTMLElement>(`[data-conversation-id="${id}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }
)
const newConversationLabel = computed(() => t('common.newConversation'))

const isStreamIn = computed(() => Boolean(chatStore.isStreamIn))
// 导航只在提交窗口拦；生成中允许自由切换（切走后台继续跑，切回自动恢复）
const isNavigationLocked = computed(() => Boolean(chatStore.isNavigationLocked))

function handleConversationRowClick(item: Chat.ConversationGroup) {
  if (renamingConversationId.value === item.uuid) return
  void navigation.openConversation(item.uuid)
}

function setRenameInputRef(el: Element | ComponentPublicInstance | null) {
  renameInputRef.value = el instanceof HTMLInputElement ? el : null
}

function focusRenameInput() {
  nextTick(() => {
    const focusInput = () => {
      const input = renameInputRef.value
      if (!input) return
      input.focus({ preventScroll: true })
      input.select()
    }

    window.requestAnimationFrame(focusInput)
  })
}

function startRenameConversation(item: Chat.ConversationGroup) {
  renamingConversationId.value = item.uuid
  renameValue.value = item.title || newConversationLabel.value
  focusRenameInput()
}

function cancelRenameConversation() {
  renamingConversationId.value = ''
  renameValue.value = ''
}

function closeConversationMenu(item: Chat.ConversationGroup) {
  conversationMenuStates.value[item.uuid] = false
}

async function commitRenameConversation(item: Chat.ConversationGroup) {
  if (renameSubmitting.value || renamingConversationId.value !== item.uuid) return

  const nextTitle = renameValue.value.trim()
  // 未命名会话的输入框预填的是显示用的「新对话」：原样确认等于没改，不能把兜底文案写进服务端
  if (!nextTitle || nextTitle === (item.title || newConversationLabel.value)) {
    cancelRenameConversation()
    return
  }

  renameSubmitting.value = true
  try {
    await chatStore.updateConversationGroup(item.uuid, { title: nextTitle })
    cancelRenameConversation()
  } catch (error: any) {
    ms.error(error?.message || t('chat.updateConversationFailed'))
  } finally {
    renameSubmitting.value = false
  }
}

async function toggleConversationSticky(item: Chat.ConversationGroup) {
  closeConversationMenu(item)
  if (isNavigationLocked.value) {
    ms.info(t('chat.waitForSending'))
    return
  }

  try {
    await chatStore.updateConversationGroup(item.uuid, { isSticky: !item.isSticky })
  } catch (error: any) {
    ms.error(error?.message || t('chat.updateConversationFailed'))
  }
}

async function deleteGroupWorkspace(item: Chat.ConversationGroup) {
  closeConversationMenu(item)
  if (isStreamIn.value && chatStore.active === item.uuid) {
    ms.info(t('chat.waitForAiResponse'))
    return
  }

  const confirmed = await confirmDialog({
    title: t('chat.deleteConversation'),
    content: t('chat.deleteConversationConfirm'),
    positiveText: t('chat.delete'),
    negativeText: t('common.cancel'),
    tone: 'danger',
  })
  if (!confirmed) return

  const wasActive = chatStore.active === item.uuid
  try {
    const nextWorkspaceId = await chatStore.deleteConversationGroup(item.uuid)
    ms.success(t('chat.deleteSuccess'))
    if (!wasActive) return

    if (nextWorkspaceId) {
      await navigation.openConversation(nextWorkspaceId, { checkLock: false })
      return
    }
    await navigation.leaveConversation()
  } catch (error: any) {
    ms.error(error?.message || t('common.deleteFailed'))
  }
}
</script>

<template>
  <div class="type-control flex h-full min-h-0 flex-col">
    <div
      class="flex-shrink-0 border-b px-2 pb-1.5 pt-1.5 transition-colors"
      :class="isConversationListScrolled ? 'border-app-divider' : 'border-transparent'"
    >
      <nav class="space-y-0.5">
        <UiButton
          v-if="authStore.isLogin"
          :scale="false"
          type="button"
          class="chat-sidebar-nav-item w-full gap-2"
          :aria-label="newConversationLabel"
          @click="navigation.startNewConversation()"
        >
          <SidebarIcon name="new-chat" />
          <span class="min-w-0 truncate">
            {{ newConversationLabel }}
          </span>
        </UiButton>
        <PackSlot name="sider.list" />
      </nav>
    </div>

    <ScrollShadow
      ref="conversationScrollRef"
      class="custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-4"
    >
      <div class="px-2" :class="{ 'pt-2': listState }">
        <!-- 播报区常驻：跟着状态一起插入的播报区，读屏往往不念 -->
        <p class="sr-only" role="status">
          {{ listState === 'loading' ? t('common.loading') : listStateMessage }}
        </p>
        <UiStateView
          v-if="listState"
          compact
          :live="false"
          :state="listState"
          :message="listStateMessage"
          @retry="retryConversationList"
        />
      </div>
      <div v-if="showConversationList" class="px-2 pb-1 pt-2">
        <div class="type-caption px-3 pb-1 text-text-muted">
          {{ t('chat.historyConversations') }}
        </div>

        <!-- 整行可点；键盘与读屏走行内的打开按钮（行里还有「更多」按钮，不能再把整行做成按钮） -->
        <div
          v-for="item in conversationGroups"
          :key="item.uuid"
          class="chat-sidebar-conversation group/conversation relative flex w-full cursor-pointer items-center gap-2 text-text-primary"
          :class="{ 'is-active': chatStore.active === item.uuid }"
          :data-conversation-id="item.uuid"
          @click="handleConversationRowClick(item)"
        >
          <template v-if="renamingConversationId === item.uuid">
            <span class="invisible block min-w-0 flex-1 truncate text-left" aria-hidden="true">
              {{ item.title || newConversationLabel }}
            </span>
            <input
              :ref="setRenameInputRef"
              v-model="renameValue"
              class="absolute inset-0 h-full w-full rounded-lg border border-[color:var(--app-border)] bg-app-elevated px-3 py-0 text-text-primary outline-none focus:border-[color:var(--input-border-focus)]"
              :disabled="renameSubmitting"
              :aria-label="t('common.editTitle')"
              @click.stop
              @keydown.stop
              @keydown.enter.prevent="commitRenameConversation(item)"
              @keydown.esc.prevent="cancelRenameConversation"
              @blur="commitRenameConversation(item)"
            />
          </template>
          <template v-else>
            <button
              type="button"
              class="chat-sidebar-conversation-open flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
              :aria-current="chatStore.active === item.uuid ? 'page' : undefined"
            >
              <Pin
                v-if="item.isSticky"
                :size="12"
                class="shrink-0 text-text-muted"
                aria-hidden="true"
              />
              <span v-if="item.isSticky" class="sr-only">{{ t('chat.pinned') }}</span>
              <span class="block min-w-0 truncate">{{ item.title || newConversationLabel }}</span>
            </button>

            <div
              class="-my-1 ml-1 flex shrink-0 items-center transition-opacity"
              :class="
                chatStore.active === item.uuid || conversationMenuStates[item.uuid]
                  ? 'opacity-100'
                  : isMobile
                    ? 'opacity-100'
                    : 'opacity-0 group-hover/conversation:opacity-100 group-focus-within/conversation:opacity-100'
              "
              @click.stop
            >
              <DropdownMenu
                v-model="conversationMenuStates[item.uuid]"
                trigger="click"
                position="auto"
                teleport
                menu-class="menu-action"
                min-width="132px"
              >
                <template #trigger="{ triggerProps }">
                  <ActionIcon
                    v-bind="triggerProps"
                    class="conversation-more"
                    :scale="false"
                    :label="t('chat.more')"
                  >
                    <Ellipsis :size="16" aria-hidden="true" />
                  </ActionIcon>
                </template>

                <template #menu="{ close }">
                  <div class="menu-action-list">
                    <MenuItem
                      @click="
                        () => {
                          toggleConversationSticky(item)
                          close()
                        }
                      "
                    >
                      <template #icon>
                        <PinOff v-if="item.isSticky" :size="16" aria-hidden="true" />
                        <Pin v-else :size="16" aria-hidden="true" />
                      </template>
                      <span>{{
                        item.isSticky ? t('chat.unfavorite') : t('chat.favoriteConversations')
                      }}</span>
                    </MenuItem>

                    <MenuItem
                      @click="
                        () => {
                          startRenameConversation(item)
                          close()
                        }
                      "
                    >
                      <template #icon>
                        <Pencil :size="16" aria-hidden="true" />
                      </template>
                      <span>{{ t('chat.rename') }}</span>
                    </MenuItem>

                    <MenuItem
                      danger
                      @click="
                        () => {
                          deleteGroupWorkspace(item)
                          close()
                        }
                      "
                    >
                      <template #icon>
                        <Trash2 :size="16" aria-hidden="true" />
                      </template>
                      <span>{{ t('chat.deleteConversation') }}</span>
                    </MenuItem>
                  </div>
                </template>
              </DropdownMenu>
            </div>
          </template>
        </div>
      </div>
    </ScrollShadow>
  </div>
</template>
