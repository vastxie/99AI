import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import i18n, { installI18n, setLocale } from '@/locales'

const initialLocale = i18n.global.locale.value

afterEach(() => {
  i18n.global.locale.value = initialLocale
  localStorage.clear()
})

describe('页面语言', () => {
  it('安装时与切换语言时，<html lang> 跟着界面语言走（读屏按它选择发音）', async () => {
    document.documentElement.lang = 'zh-cmn-Hans'
    installI18n(createApp({}))
    expect(document.documentElement.lang).toBe(i18n.global.locale.value)

    await setLocale('en-US')
    expect(document.documentElement.lang).toBe('en-US')
    await setLocale('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })
})
