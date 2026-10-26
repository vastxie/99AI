import { expect, type Page } from '@playwright/test'
import type { TestUser } from './api'
import { env } from './env'

/** 用超级管理员登录管理后台，返回主导航 */
export async function signInAdmin(page: Page) {
  await page.goto('/admin/')
  await page.getByRole('textbox', { name: '用户名' }).fill('super')
  await page.getByRole('textbox', { name: '密码' }).fill(env.adminPassword)
  await page.getByRole('button', { name: '登录' }).click()
  const navigation = page.getByRole('navigation', { name: '主导航' })
  await expect(navigation).toBeVisible()
  return navigation
}

/** 从首页打开登录框，用账号密码登录 */
export async function login(page: Page, user: TestUser) {
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: '账号' }).fill(user.username)
  await dialog.getByRole('textbox', { name: '密码' }).fill(user.password)
  await dialog.getByRole('button', { name: '登录账号' }).click()
  await expect(dialog).toBeHidden()
  await expect(accountButton(page, user)).toBeVisible()
}

export function accountButton(page: Page, user: TestUser) {
  return page.getByRole('button', { name: `${user.nickname}：账号与设置` })
}

export function composer(page: Page) {
  return page.getByRole('textbox', { name: '聊天消息输入框' })
}

/** 在输入框里写一条消息并发送 */
export async function send(page: Page, text: string) {
  await composer(page).fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
}

/** 助手回复正文里的一段（多轮对话时侧边的回合导航也会显示回复摘要，这里只取正文段落） */
export function reply(page: Page, text: string) {
  return page.getByRole('paragraph').filter({ hasText: text })
}
