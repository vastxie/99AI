import { useChatStore } from '@/store'

export function useChat() {
  const chatStore = useChatStore()

  const addGroupChat = (chat: Chat.Chat) => {
    chatStore.addGroupChat(chat)
  }

  const updateGroupChat = (index: number, chat: Chat.Chat) => {
    chatStore.updateGroupChat(index, chat)
  }

  const updateGroupChatSome = (index: number, chat: Partial<Chat.Chat>) => {
    chatStore.updateGroupChatSome(index, chat)
  }

  return {
    addGroupChat,
    updateGroupChat,
    updateGroupChatSome,
  }
}
