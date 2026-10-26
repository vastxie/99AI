import { beforeEach, describe, expect, it } from 'vitest'
import {
  consumeOAuthRedirectPath,
  normalizeOAuthRedirectPath,
  saveOAuthRedirectPath,
} from './oauthRedirect'

const CONVERSATION = '/c/g_aaaaaaaaaaaaaaaaaaaaaaaa'

describe('登录回跳地址', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('会话页可以原样回去（回归：以前的白名单匹配不到真实会话路由，一律回首页）', () => {
    expect(normalizeOAuthRedirectPath(CONVERSATION)).toBe(CONVERSATION)
    expect(normalizeOAuthRedirectPath('/')).toBe('/')
  })

  it('不是首页或会话页、外站地址、协议相对地址一律回首页', () => {
    for (const path of [
      '/c/abc',
      '/c/g_short',
      '/admin',
      '//evil.example',
      'https://evil.example/',
    ]) {
      expect(normalizeOAuthRedirectPath(path)).toBe('/')
    }
    expect(normalizeOAuthRedirectPath('/auth/callback/github')).toBe('/')
  })

  it('去掉授权参数与登录弹窗的 hash，保留设置页的 hash（绑定流程要回到设置）', () => {
    expect(normalizeOAuthRedirectPath(`${CONVERSATION}?code=1&state=2#login`)).toBe(CONVERSATION)
    expect(normalizeOAuthRedirectPath('/#register')).toBe('/')
    expect(normalizeOAuthRedirectPath('/#settings/account')).toBe('/#settings/account')
  })

  it('保存后只能取一次', () => {
    saveOAuthRedirectPath(`${CONVERSATION}#login`)
    expect(consumeOAuthRedirectPath()).toBe(CONVERSATION)
    expect(consumeOAuthRedirectPath()).toBe('/')
  })
})
