import DOMPurify from 'dompurify'
import { type ModelIconName, modelIconSvgs } from './modelIconSvgs'

export interface BuiltinModelAvatar {
  svg: string
}

const providerAvatarAliases: Record<string, ModelIconName> = {
  openrouter: 'openrouter',
  router: 'openrouter',
  openai: 'openai',
  chatgpt: 'openai',
  gpt: 'openai',
  claude: 'claude',
  anthropic: 'claude',
  gemini: 'gemini',
  google: 'gemini',
  deepseek: 'deepseek',
  qwen: 'qwen',
  tongyi: 'qwen',
  bailian: 'qwen',
  alibaba: 'qwen',
  chatglm: 'zhipu',
  glm: 'zhipu',
  zhipu: 'zhipu',
  kimi: 'kimi',
  moonshot: 'kimi',
  doubao: 'doubao',
  bytedance: 'doubao',
  volcengine: 'doubao',
  ark: 'doubao',
  hunyuan: 'hunyuan',
  tencent: 'hunyuan',
  yuanbao: 'hunyuan',
  wenxin: 'wenxin',
  ernie: 'wenxin',
  baidu: 'wenxin',
  xiaomimimo: 'xiaomimimo',
  xiaomi: 'xiaomimimo',
  mimo: 'xiaomimimo',
  minimax: 'minimax',
  xai: 'xai',
  grok: 'xai',
  mistral: 'mistral',
  llama: 'meta',
  meta: 'meta',
  perplexity: 'perplexity',
  pplx: 'perplexity',
  zeroone: 'zeroone',
  yi: 'zeroone',
  spark: 'spark',
  iflytek: 'spark',
  xunfei: 'spark',
  siliconcloud: 'siliconcloud',
  siliconflow: 'siliconcloud',
}

const removeSvgTitles = (svgText: string): string => {
  return svgText.replaceAll(/<title\b[^>]*>[\s\S]*?<\/title>/giu, '')
}

const fitSvgToContainer = (svgText: string): string => {
  return svgText.replace(/<svg\b([^>]*)>/iu, (_, attrs: string) => {
    let nextAttrs = attrs.replaceAll(/\s(width|height)="[^"]*"/giu, '')

    if (/\sstyle="/iu.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/style="([^"]*)"/iu, 'style="$1; width: 100%; height: 100%;"')
    } else {
      nextAttrs = ` style="width: 100%; height: 100%;"${nextAttrs}`
    }

    return `<svg${nextAttrs}>`
  })
}

export const isSvgCode = (content: string): boolean => {
  if (!content) return false

  const trimmed = content.trim()

  return trimmed.startsWith('<svg') && trimmed.includes('</svg>')
}

export const isSvgUrl = (url: string): boolean => {
  if (!url) return false

  const urlWithoutQuery = url.split('?')[0].toLowerCase()

  return urlWithoutQuery.endsWith('.svg')
}

export const shouldRenderSvg = (content: string): boolean => {
  return isSvgCode(content) || isSvgUrl(content)
}

export const sanitizeSvg = (svgText: string): string => {
  let clean = DOMPurify.sanitize(removeSvgTitles(svgText), {
    USE_PROFILES: { svg: true, svgFilters: true },
    RETURN_DOM: false,
  }) as string

  if (!clean.includes('viewBox')) {
    clean = clean.replace('<svg', '<svg viewBox="0 0 24 24"')
  }

  return fitSvgToContainer(clean)
}

export const resolveModelAvatarName = (model?: string): ModelIconName | null => {
  if (!model) return null

  const normalizedModel = model.toLowerCase()

  for (const [alias, avatarName] of Object.entries(providerAvatarAliases)) {
    if (normalizedModel.includes(alias.toLowerCase())) {
      return avatarName
    }
  }

  return null
}

export const getBuiltinModelAvatar = (model?: string): BuiltinModelAvatar | null => {
  const avatarName = resolveModelAvatarName(model)

  if (!avatarName) return null

  return {
    svg: modelIconSvgs[avatarName],
  }
}
