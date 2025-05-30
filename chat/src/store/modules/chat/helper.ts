import { ss } from '@/utils/storage'

const LOCAL_NAME = 'chatStorage'

export function defaultState(): Chat.ChatState {
  return {
    active: 0,
    usingContext: true,
    usingNetwork: false,
    usingDeepThinking: false,
    usingMcpTool: false,
    groupList: [],
    chatList: [],
    groupKeyWord: '',
    baseConfig: null,
    currentPlugin: undefined,
    pluginList: [],
    prompt: '',
    reasoningText: '',
  }
}

export function getLocalState(): Chat.ChatState {
  const localState = ss.get(LOCAL_NAME)
  return { ...defaultState(), ...localState }
}

export function setLocalState({ active }: Chat.ChatState) {
  ss.set(LOCAL_NAME, { ...ss.get(LOCAL_NAME), active })
}

export function formatChatPre(data: any): any {
  return data.map((item: any) => {
    const { name, childList, id } = item
    return {
      label: name,
      value: id,
      children: childList.map((t: any) => {
        return {
          label: t.title,
          value: t.prompt,
        }
      }),
    }
  })
}
