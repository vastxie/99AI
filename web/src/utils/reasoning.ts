import { t } from '@/locales'

export const REASONING_LEVEL_OPTIONS: ReadonlyArray<{
  value: Chat.ReasoningEffort
}> = [
  { value: 'off' },
  { value: 'minimal' },
  { value: 'low' },
  { value: 'medium' },
  { value: 'high' },
  { value: 'xhigh' },
  { value: 'max' },
]

const REASONING_LEVEL_ORDER = REASONING_LEVEL_OPTIONS.map(item => item.value)
const DEFAULT_LEVELS: Chat.ReasoningEffort[] = ['medium']
const DEFAULT_LEVEL: Chat.ReasoningEffort = 'medium'

export interface ModelReasoningControl {
  levels: Chat.ReasoningEffort[]
  defaultLevel: Chat.ReasoningEffort
}

export function normalizeReasoningEffort(value: unknown): Chat.ReasoningEffort | undefined {
  switch (
    String(value || '')
      .trim()
      .toLowerCase()
  ) {
    case 'off':
      return 'off'
    case 'minimal':
      return 'minimal'
    case 'low':
      return 'low'
    case 'medium':
      return 'medium'
    case 'high':
      return 'high'
    case 'xhigh':
      return 'xhigh'
    case 'max':
      return 'max'
    default:
      return undefined
  }
}

export function getModelReasoningControl(capabilities: any): ModelReasoningControl {
  const input =
    capabilities?.reasoningControl &&
    typeof capabilities.reasoningControl === 'object' &&
    !Array.isArray(capabilities.reasoningControl)
      ? capabilities.reasoningControl
      : {}
  const requestedLevels = Array.isArray(input.levels) ? input.levels : []
  const levels = REASONING_LEVEL_ORDER.filter(level =>
    requestedLevels.some((value: unknown) => normalizeReasoningEffort(value) === level)
  )
  const effectiveLevels = levels.length > 0 ? levels : [...DEFAULT_LEVELS]
  const requestedDefault = normalizeReasoningEffort(input.defaultLevel)
  const defaultLevel =
    requestedDefault && effectiveLevels.includes(requestedDefault)
      ? requestedDefault
      : effectiveLevels.includes(DEFAULT_LEVEL)
        ? DEFAULT_LEVEL
        : effectiveLevels[0]

  return { levels: effectiveLevels, defaultLevel }
}

export function resolveReasoningEffort(value: unknown, capabilities: any): Chat.ReasoningEffort {
  const control = getModelReasoningControl(capabilities)
  const requested = normalizeReasoningEffort(value)
  return requested && control.levels.includes(requested) ? requested : control.defaultLevel
}

export function getReasoningLevelLabel(value: Chat.ReasoningEffort): string {
  const labelKeys: Record<Chat.ReasoningEffort, string> = {
    off: 'chat.reasoningOff',
    minimal: 'chat.reasoningMinimal',
    low: 'chat.reasoningLow',
    medium: 'chat.reasoningMedium',
    high: 'chat.reasoningHigh',
    xhigh: 'chat.reasoningXHigh',
    max: 'chat.reasoningMax',
  }
  return t(labelKeys[value] || 'chat.reasoningMedium')
}
