export interface FallbackAvatar {
  label: string
  background: string
  color: string
  borderColor: string
}

const FALLBACK_COLORS = [
  {
    background: 'linear-gradient(135deg, #eef2ff 0%, #c7d2fe 100%)',
    color: '#3730a3',
    borderColor: '#c7d2fe',
  },
  {
    background: 'linear-gradient(135deg, #ecfeff 0%, #a5f3fc 100%)',
    color: '#155e75',
    borderColor: '#a5f3fc',
  },
  {
    background: 'linear-gradient(135deg, #ecfdf5 0%, #bbf7d0 100%)',
    color: '#166534',
    borderColor: '#bbf7d0',
  },
  {
    background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
    color: '#9a3412',
    borderColor: '#fed7aa',
  },
  {
    background: 'linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 100%)',
    color: '#9d174d',
    borderColor: '#fbcfe8',
  },
  {
    background: 'linear-gradient(135deg, #f5f3ff 0%, #ddd6fe 100%)',
    color: '#5b21b6',
    borderColor: '#ddd6fe',
  },
]

const hashString = (value: string): number => {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

const normalizeAvatarSource = (modelName?: string, model?: string): string => {
  return (modelName || model || 'AI').trim()
}

const getFallbackLabel = (source: string): string => {
  const normalized = source.replaceAll(/[_\-.:/]+/gu, ' ').trim()

  if (!normalized) {
    return 'AI'
  }

  const cjkChars = normalized.match(/[\u4E00-\u9FFF]/gu)

  if (cjkChars?.length) {
    return cjkChars.slice(0, 2).join('')
  }

  const tokens = normalized.match(/[A-Za-z0-9]+/gu) || []

  if (tokens.length >= 2) {
    return `${tokens[0]?.[0] || ''}${tokens[1]?.[0] || ''}`.toUpperCase()
  }

  if (tokens.length === 1) {
    return (tokens[0] || '').slice(0, 2).toUpperCase()
  }

  return normalized.slice(0, 2).toUpperCase()
}

export const getFallbackAvatar = (modelName?: string, model?: string): FallbackAvatar => {
  const source = normalizeAvatarSource(modelName, model)
  const color = FALLBACK_COLORS[hashString(source.toLowerCase()) % FALLBACK_COLORS.length]

  return {
    label: getFallbackLabel(source),
    ...color,
  }
}
