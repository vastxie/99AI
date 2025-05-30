import { ss } from '@/utils/storage'

const LOCAL_NAME = 'promptStore'

export type PromptList = []

export interface PromptStore {
  promptList: PromptList
}

export function getLocalPromptList(): PromptStore {
  const storage = ss.get(LOCAL_NAME)
  const promptStore: PromptStore | undefined = storage
  return promptStore ?? { promptList: [] }
}

export function setLocalPromptList(promptStore: PromptStore): void {
  ss.set(LOCAL_NAME, promptStore)
}
