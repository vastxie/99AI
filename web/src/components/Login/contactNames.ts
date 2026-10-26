import type { AuthProviderEntry } from '@/api/user'
import { t } from '@/locales'

/** 验证码渠道在输入框提示里的称呼：按联系方式类型用简短文案，其余用服务端展示名 */
const CONTACT_NAME_KEYS: Record<string, string> = {
  email: 'login.email',
  phone: 'login.phone',
}

export function contactNameOf(entry: AuthProviderEntry): string {
  const key = entry.contactField ? CONTACT_NAME_KEYS[entry.contactField] : undefined
  return key ? t(key) : entry.displayName
}

export function contactNamesOf(entries: AuthProviderEntry[]): string[] {
  return entries.map(contactNameOf)
}
