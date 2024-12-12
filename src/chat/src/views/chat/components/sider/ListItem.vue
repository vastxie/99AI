<script setup lang="ts">
import { t } from '@/locales';
import { useChatStore } from '@/store';
import { debounce } from '@/utils/functions/debounce';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import { CheckIcon, EllipsisHorizontalIcon } from '@heroicons/vue/24/outline';

interface Props {
  dataSources?: Chat.ChatState['groupList'];
  title?: string;
}
interface Emit {
  (ev: 'update', group: Chat.History, isEdit: boolean): void;
  (ev: 'delete', group: Chat.History): void;
  (ev: 'sticky', group: Chat.History): void;
  (ev: 'select', group: Chat.History): void;
}
const props = defineProps<Props>();
const emit = defineEmits<Emit>();

const dataSources = props.dataSources;

const chatStore = useChatStore();

async function handleSelect(group: Chat.History) {
  emit('select', group);
}

function handleEdit(group: Chat.History, isEdit: boolean, event?: MouseEvent) {
  event?.stopPropagation();
  group.isEdit = isEdit;
}

async function handleSticky(group: Chat.History, event?: MouseEvent) {
  event?.stopPropagation();
  await chatStore.updateGroupInfo({
    isSticky: !group.isSticky,
    groupId: group.uuid,
  });
}

/* 删除对话组 */
async function handleDelete(
  params: Chat.History,
  event?: MouseEvent | TouchEvent
) {
  event?.stopPropagation();
  emit('delete', params);
}

const handleDeleteDebounce = debounce(handleDelete, 600);

/* 修改对话组title */
async function updateGroupTitle(params: Chat.History) {
  const { uuid, title } = params;
  params.isEdit = false;
  await chatStore.updateGroupInfo({ groupId: uuid, title });
}

/* 修改对话组信息 */
async function handleEnter(params: Chat.History, event: KeyboardEvent) {
  event?.stopPropagation();

  if (event.key === 'Enter') updateGroupTitle(params);
}

/* 判断是不是当前选中 */
function isActive(uuid: number) {
  return chatStore.active === uuid;
}
</script>

<template>
  <p class="mt-3 mb-1 text-xs font-bold">
    {{ props.title }} <span class="ml-1">({{ dataSources?.length }})</span>
  </p>
  <div v-for="item of dataSources" :key="`${item.uuid}`">
    <div
      class="relative flex items-center gap-3 px-3 py-2 break-all rounded-md cursor-pointer hover:bg-white group dark:hover:bg-gray-800 font-medium text-sm"
      :class="
        isActive(item.uuid)
          ? [
              'bg-white',
              'text-primary-600',
              'dark:bg-gray-800',
              'dark:text-white',
            ]
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
        <CheckIcon
          v-if="item.isEdit"
          class="h-5 w-5 ml-2"
          aria-hidden="true"
          @click="updateGroupTitle(item)"
        />
      </div>
      <div v-if="isActive(item.uuid)" class="absolute z-10 right-2">
        <template v-if="!item.isEdit">
          <!-- 下拉菜单 -->
          <Menu as="div" class="relative inline-block text-left">
            <MenuButton class="p-1">
              <EllipsisHorizontalIcon class="h-5 w-5" aria-hidden="true" />
            </MenuButton>
            <transition
              enter-active-class="transition ease-out duration-100"
              enter-from-class="transform opacity-0 scale-95"
              enter-to-class="transform opacity-100 scale-100"
              leave-active-class="transition ease-in duration-75"
              leave-from-class="transform opacity-100 scale-100"
              leave-to-class="transform opacity-0 scale-95"
            >
              <MenuItems
                class="absolute right-0 z-10 mt-2 w-32 text-gray-700 dark:text-gray-400 origin-top-right text-b rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none bg-primary-100 dark:bg-gray-800"
              >
                <div class="py-1">
                  <MenuItem v-slot="{ active }" as="template">
                    <button
                      :class="[
                        active
                          ? 'flex items-center bg-gray-100 dark:bg-gray-700 '
                          : 'flex items-center ',
                        'block w-full px-4 py-2 text-left text-sm',
                      ]"
                      @click="handleEdit(item, true, $event)"
                    >
                      {{ t('chat.rename') }}
                    </button>
                  </MenuItem>
                  <MenuItem v-slot="{ active }" as="template">
                    <button
                      :class="[
                        active
                          ? 'flex items-end mr-3 bg-gray-100 dark:bg-gray-700'
                          : 'flex items-end ',
                        'block w-full px-4 py-2 text-left text-sm',
                      ]"
                      @click="handleSticky(item, $event)"
                    >
                      {{
                        item.isSticky
                          ? t('chat.unfavorite')
                          : t('chat.favoriteConversations')
                      }}
                    </button>
                  </MenuItem>
                  <MenuItem v-slot="{ active }" as="template">
                    <button
                      :class="[
                        active
                          ? 'flex items-center bg-gray-100 dark:bg-gray-700'
                          : 'flex items-center ',
                        'block w-full px-4 py-2 text-left text-sm',
                      ]"
                      @click="handleDeleteDebounce(item, $event)"
                    >
                      {{ t('chat.deleteConversation') }}
                    </button>
                  </MenuItem>
                </div>
              </MenuItems>
            </transition>
          </Menu>
        </template>
      </div>
    </div>
  </div>
</template>
