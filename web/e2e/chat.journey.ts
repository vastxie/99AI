import { expect, test, type Page } from '@playwright/test'
import { registerUser } from './support/api'
import { accountButton, composer, login, reply, send } from './support/app'

/** 模拟模型的剧本标记与固定文本，与 scripts/smoke/constants.mjs 一致 */
const SLOW = '[mock:slow]'
const TABLE = '[mock:table]'
const TOOL_TURN_DONE = 'SMOKE_TURN_DONE'
const SLOW_TURN_DONE = 'SLOW_STREAM_DONE'

function conversations(page: Page) {
  // 模拟模型给每个对话生成的标题都是这一个
  return page.getByRole('button', { name: 'Smoke conversation', exact: true })
}

test('密码登录后问候语带昵称；退出后回到访客', async ({ page }) => {
  const user = await registerUser()
  await login(page, user)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(user.nickname)

  await accountButton(page, user).click()
  await page.getByRole('menuitem', { name: '退出登录' }).click()
  await page
    .getByRole('dialog', { name: '退出登录' })
    .getByRole('button', { name: '退出登录' })
    .click()

  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  await expect(accountButton(page, user)).toBeHidden()
})

test('发一条消息：工具调用、文件卡片和最终回复都出现，文件能下载，刷新后还在', async ({ page }) => {
  const user = await registerUser()
  await login(page, user)
  await send(page, '请生成冒烟产物')

  await expect(reply(page, TOOL_TURN_DONE)).toBeVisible()
  await expect(page.getByRole('button', { name: /1 次工具调用/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '预览 smoke.txt' })).toBeVisible()
  await expect(page).toHaveURL(/\/c\/g_/)

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 smoke.txt' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('smoke.txt')
  let content = ''
  for await (const chunk of await download.createReadStream()) content += chunk
  expect(content).toBe('smoke-artifact-ok\n')

  await page.reload()
  await expect(page.getByText('请生成冒烟产物')).toBeVisible()
  await expect(reply(page, TOOL_TURN_DONE)).toBeVisible()
  await expect(page.getByRole('button', { name: '预览 smoke.txt' })).toBeVisible()
  await expect(accountButton(page, user)).toBeVisible()
  await expect(composer(page)).toBeEditable()
})

test('新开一个对话后，从侧栏切回原来的对话', async ({ page }) => {
  const user = await registerUser()
  await login(page, user)
  await send(page, '第一个对话的问题')
  await expect(reply(page, TOOL_TURN_DONE)).toBeVisible()
  await expect(conversations(page)).toHaveCount(1)

  await page.getByRole('navigation').getByRole('button', { name: '新对话' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(user.nickname)
  await send(page, `第二个对话的问题 ${TABLE}`)
  // 表格剧本的回复里有两张表
  const tables = page.getByRole('table')
  await expect(tables).toHaveCount(2)
  await expect(conversations(page)).toHaveCount(2)

  // 列表按最近使用排序：第二项是先建的那个对话
  await conversations(page).nth(1).click()
  await expect(page.getByText('第一个对话的问题')).toBeVisible()
  await expect(reply(page, TOOL_TURN_DONE)).toBeVisible()
  await expect(tables).toHaveCount(0)

  await conversations(page).nth(0).click()
  await expect(tables).toHaveCount(2)
  await expect(page.getByText('第一个对话的问题')).toBeHidden()
})

test('生成中点停止：回复停住，之后还能继续发消息', async ({ page }) => {
  const user = await registerUser()
  await login(page, user)
  await send(page, `慢一点说 ${SLOW}`)
  await expect(reply(page, '片段 3。')).toBeVisible()

  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.getByText('已停止生成')).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成' })).toBeHidden()
  await expect(reply(page, SLOW_TURN_DONE)).toBeHidden()

  await send(page, '再来一次')
  await expect(reply(page, TOOL_TURN_DONE)).toBeVisible()
})

test('点停止后，已经显示出来的文字留在界面上', async ({ page }) => {
  const user = await registerUser()
  await login(page, user)
  await send(page, `慢一点说 ${SLOW}`)
  await expect(reply(page, '片段 12。')).toBeVisible()

  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.getByText('已停止生成')).toBeVisible()
  await expect(reply(page, '片段 12。')).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成' })).toBeHidden()

  // 刷新后看到的是服务端落库的内容：同样包含停止前已经显示的部分
  await page.reload()
  await expect(page.getByText('已停止生成')).toBeVisible()
  await expect(reply(page, '片段 12。')).toBeVisible()
})

test('生成中断网几秒再恢复：回复自动接上并完成', async ({ page, context }) => {
  const user = await registerUser()
  await login(page, user)
  await send(page, `慢一点说 ${SLOW}`)
  await expect(reply(page, '片段 3。')).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByText('网络连接中断，正在重新连接…')).toBeVisible()
  await context.setOffline(false)

  await expect(reply(page, SLOW_TURN_DONE)).toBeVisible({ timeout: 40_000 })
  await expect(reply(page, '片段 40。')).toBeVisible()
  await expect(composer(page)).toBeEditable()
})
