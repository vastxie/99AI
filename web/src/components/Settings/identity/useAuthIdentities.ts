import { getLoginMethodUi } from '@/auth/loginMethodUi'
import {
  fetchAuthIdentitiesAPI,
  fetchAuthProvidersAPI,
  type AuthIdentityView,
  type AuthProviderEntry,
} from '@/api/user'
import { t } from '@/locales'
import { computed, ref } from 'vue'

export type IdentityKind = 'captcha' | 'oauth' | 'qr'

export interface IdentityRow {
  provider: string
  kind: IdentityKind
  displayName: string
  identity?: AuthIdentityView
  bound: boolean
  /** 对应登录方式当前是否可用于绑定（包关闭 / 后台停用时仍展示已绑定记录，但只能解绑） */
  canBind: boolean
}

/** 验证码类方式按联系方式类型命名（内核概念）；其它方式用各包登记的显示名或服务端展示名 */
const CONTACT_LABEL_KEYS: Record<string, string> = {
  email: 'settings.email',
  phone: 'settings.phoneNumber',
}

function labelOf(provider: string, entry?: AuthProviderEntry): string {
  const registered = getLoginMethodUi(provider)?.label?.()
  if (registered) return registered
  const contactKey = entry?.contactField ? CONTACT_LABEL_KEYS[entry.contactField] : undefined
  if (contactKey) return t(contactKey)
  return entry?.displayName || provider
}

/** 账号页「账户安全」数据：登录方式 × 已绑定身份，按 provider 合并成一行 */
export function useAuthIdentities() {
  const providers = ref<AuthProviderEntry[]>([])
  const identities = ref<AuthIdentityView[]>([])

  async function load() {
    const [providerRes, identityRes] = await Promise.allSettled([
      fetchAuthProvidersAPI(),
      fetchAuthIdentitiesAPI(),
    ])
    if (providerRes.status === 'fulfilled' && providerRes.value.success) {
      providers.value = Array.isArray(providerRes.value.data) ? providerRes.value.data : []
    }
    if (identityRes.status === 'fulfilled' && identityRes.value.success) {
      identities.value = Array.isArray(identityRes.value.data) ? identityRes.value.data : []
    }
  }

  const rows = computed<IdentityRow[]>(() => {
    const bindable = new Map<string, { kind: IdentityKind; entry: AuthProviderEntry }>()
    for (const entry of providers.value) {
      if (entry.enabled === false || entry.type === 'password') continue
      if (bindable.has(entry.provider)) continue
      if (entry.type === 'captcha' || entry.type === 'qr') {
        bindable.set(entry.provider, { kind: entry.type, entry })
      } else if (entry.type === 'oauth' && entry.scene === 'login') {
        bindable.set(entry.provider, { kind: 'oauth', entry })
      }
    }
    const result: IdentityRow[] = []
    for (const [provider, { kind, entry }] of bindable) {
      const identity = identities.value.find(item => item.provider === provider)
      result.push({
        provider,
        kind,
        displayName: labelOf(provider, entry),
        identity,
        bound: Boolean(identity),
        canBind: true,
      })
    }
    for (const identity of identities.value) {
      if (bindable.has(identity.provider)) continue
      if (result.some(row => row.provider === identity.provider)) continue
      const entry = providers.value.find(item => item.provider === identity.provider)
      result.push({
        provider: identity.provider,
        kind: 'oauth',
        displayName: labelOf(identity.provider, entry),
        identity,
        bound: true,
        canBind: false,
      })
    }
    return result
  })

  return { providers, identities, rows, load }
}
