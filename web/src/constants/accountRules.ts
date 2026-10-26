import { t } from '@/locales'

/**
 * 账号字段规则，以服务端校验为准（server/src/modules/auth/dto 下的登录、注册、找回、改密 DTO）。
 * 前端只提前给出同样的提示，不另立规则。
 */
export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 30
/** 登录名：用户名、邮箱或手机号 */
export const LOGIN_NAME_MIN_LENGTH = 2
/** 注册用户名：2-12 位字母、数字、下划线、短横和点 */
export const USERNAME_MIN_LENGTH = 2
export const USERNAME_MAX_LENGTH = 12
export const USERNAME_PATTERN = new RegExp(
  `^[A-Za-z0-9_.-]{${USERNAME_MIN_LENGTH},${USERNAME_MAX_LENGTH}}$`
)

/** 密码不合规时返回给用户看的原因，合规返回空字符串 */
export function passwordProblem(password: string): string {
  if (password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH) return ''
  return t('login.passwordLength', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })
}

export function passwordRuleHint(): string {
  return t('login.passwordRule', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })
}

export function usernameRuleHint(): string {
  return t('login.usernameRule', { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
}
