<script setup lang="ts">
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import { debounce } from '@/utils/functions/debounce'
import { CheckSmall, More } from '@icon-park/vue-next'
import { nextTick, ref } from 'vue'

// 注册focus指令
const vFocus = {
  mounted: (el: HTMLElement) => {
    nextTick(() => {
      el.focus()
    })
  },
}

// 菜单状态管理
const menuStates = ref<Record<string | number, boolean>>({})

interface Props {
  dataSources?: Chat.ChatState['groupList']
  title?: string
}
interface Emit {
  (ev: 'update', group: Chat.History, isEdit: boolean): void
  (ev: 'delete', group: Chat.History): void
  (ev: 'sticky', group: Chat.History): void
  (ev: 'select', group: Chat.History): void
}
const props = defineProps<Props>()
const emit = defineEmits<Emit>()

const dataSources = props.dataSources

const chatStore = useChatStore()

async function handleSelect(group: Chat.History) {
  emit('select', group)
}

function handleEdit(group: Chat.History, isEdit: boolean, event?: MouseEvent) {
  event?.stopPropagation()
  group.isEdit = isEdit
}

async function handleSticky(group: Chat.History, event?: MouseEvent) {
  event?.stopPropagation()
  await chatStore.updateGroupInfo({
    isSticky: !group.isSticky,
    groupId: group.uuid,
  })
}

/* 删除对话组 */
async function handleDelete(params: Chat.History, event?: MouseEvent | TouchEvent) {
  event?.stopPropagation()
  emit('delete', params)
}

const handleDeleteDebounce = debounce(handleDelete, 600)

/* 修改对话组title */
async function updateGroupTitle(params: Chat.History) {
  const { uuid, title } = params
  params.isEdit = false
  await chatStore.updateGroupInfo({ groupId: uuid, title })
}

/* 修改对话组信息 */
async function handleEnter(params: Chat.History, event: KeyboardEvent) {
  event?.stopPropagation()

  if (event.key === 'Enter') updateGroupTitle(params)
}

/* 判断是不是当前选中 */
function isActive(uuid: number) {
  return chatStore.active === uuid
}
</script>

<template>
  <p v-if="props.title" class="text-xs font-bold">
    {{ props.title }} <span class="ml-1">({{ dataSources?.length }})</span>
  </p>
  <div v-for="item of dataSources" :key="`${item.uuid}`">
    <div
      class="relative flex items-center gap-3 px-3 py-2 break-all rounded-lg cursor-pointer hover:bg-white group dark:hover:bg-gray-800 font-medium text-sm"
      :class="
        isActive(item.uuid)
          ? ['bg-white', 'text-primary-600', 'dark:bg-gray-800', 'dark:text-white']
          : ['text-gray-700', 'dark:bg-gray-900', 'dark:text-gray-400']
      "
      @click="handleSelect(item)"
    >
      <div class="flex items-center">
        <input
          v-if="item.isEdit"
          v-model="item.title"
          v-focus
          type="text"
          class="bg-transparent border border-gray-200 dark:border-gray-400 px-1 shadow-none flex-1 truncate"
          @keypress="handleEnter(item, $event)"
        />
        <span v-else class="flex-1 truncate max-w-48">{{ item.title }}</span>
        <CheckSmall
          v-if="item.isEdit"
          class="ml-2"
          theme="outline"
          size="20"
          aria-hidden="true"
          @click="updateGroupTitle(item)"
        />
      </div>
      <div v-if="isActive(item.uuid)" class="absolute z-10 right-2 flex items-center h-full">
        <template v-if="!item.isEdit">
          <!-- 下拉菜单 -->
          <DropdownMenu v-model="menuStates[item.uuid]" position="auto" min-width="128px">
            <template #trigger>
              <div class="flex items-center justify-center w-6 h-6 transition-colors">
                <More size="20" aria-hidden="true" />
              </div>
            </template>
            <template #menu="{ close }">
              <div>
                <div
                  class="menu-item menu-item-md"
                  @click="
                    () => {
                      handleEdit(item, true)
                      close()
                    }
                  "
                  role="menuitem"
                  tabindex="0"
                >
                  {{ t('chat.rename') }}
                </div>
                <div
                  class="menu-item menu-item-md"
                  @click="
                    () => {
                      handleSticky(item)
                      close()
                    }
                  "
                  role="menuitem"
                  tabindex="0"
                >
                  {{ item.isSticky ? t('chat.unfavorite') : t('chat.favoriteConversations') }}
                </div>
                <div
                  class="menu-item menu-item-md"
                  @click="
                    () => {
                      handleDeleteDebounce(item)
                      close()
                    }
                  "
                  role="menuitem"
                  tabindex="0"
                >
                  {{ t('chat.deleteConversation') }}
                </div>
              </div>
            </template>
          </DropdownMenu>
        </template>
      </div>
    </div>
  </div>
</template>
