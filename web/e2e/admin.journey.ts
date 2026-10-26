import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { deleteModelsNamed, setSiteConfig } from './support/api'
import { signInAdmin } from './support/app'
import { env } from './support/env'

const ROUNDS_KEY = 'maxToolCallsPerRequest'
const MODEL_PREFIX = '用例模型'

// 其他用例共用同一套后端：不管这两条用例成败，结束后都经接口复原（不走界面，不会盖住用例本身的失败）
test.afterEach(async () => {
  await setSiteConfig(ROUNDS_KEY, '25')
  await deleteModelsNamed(MODEL_PREFIX)
})

test('管理后台：改一项全局配置，刷新后仍是新值', async ({ page }) => {
  await setSiteConfig(ROUNDS_KEY, '25')
  const navigation = await signInAdmin(page)
  // 等这一页把已保存的配置读回来再操作：表单的初始值与默认值相同，光看输入框分不出读完没有
  const configLoaded = () =>
    page.waitForResponse(response => response.url().includes('/config/query'))
  const loaded = configLoaded()
  await navigation.getByRole('link', { name: '全局配置' }).click()
  await loaded

  const rounds = page.getByRole('spinbutton', { name: '工具调用轮次上限' })
  await expect(rounds).toHaveValue('25')
  await expect(page.getByRole('spinbutton', { name: '模型首次响应等待上限' })).toHaveValue('120')

  const saved = page.waitForResponse(
    response => response.url().includes('/config/set') && response.request().method() === 'POST'
  )
  await rounds.fill('30')
  await rounds.blur()
  expect((await saved).ok()).toBe(true)

  const reloaded = configLoaded()
  await page.reload()
  await reloaded
  await expect(rounds).toHaveValue('30')
})

test('管理后台：新增模型后出现在列表里，再打开时密钥是脱敏的，改名和删除都生效', async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 6)
  const name = `${MODEL_PREFIX}-${suffix}`
  const renamed = `${MODEL_PREFIX}-${suffix}-改`
  const apiKey = `journey-key-${randomUUID()}`
  const navigation = await signInAdmin(page)
  await navigation.getByRole('link', { name: '模型管理', exact: true }).click()

  await page.getByRole('button', { name: '添加模型' }).click()
  const create = page.getByRole('dialog', { name: '新增模型' })
  // 建成停用的：不进用户端的模型列表，对话用例不会选到它。开关的输入框是隐藏的，用键盘切换
  await create.getByRole('switch', { name: '状态' }).press('Space')
  await create.getByRole('textbox', { name: '模型名称' }).fill(name)
  await create.getByRole('textbox', { name: 'API Key' }).fill(apiKey)
  await create.getByRole('textbox', { name: '基础地址' }).fill(env.mockUrl)
  // 绑定模型放在地址和密钥之后填：它们变化时会重新拉取可选模型
  const boundModel = create.getByRole('combobox', { name: '绑定模型' })
  await boundModel.click()
  await boundModel.fill('journey-model')
  await page.getByRole('option', { name: 'journey-model' }).click()
  await create.getByRole('button', { name: '确认新增' }).click()
  await expect(create).toBeHidden()

  const row = page.getByRole('row').filter({ hasText: name })
  await expect(row.getByRole('cell', { name: 'journey-model' })).toBeVisible()
  await expect(row.getByRole('switch')).not.toBeChecked()

  await row.getByRole('button', { name: '变更' }).click()
  const edit = page.getByRole('dialog', { name: '修改模型' })
  const keyField = edit.getByRole('textbox', { name: 'API Key' })
  await expect(keyField).toHaveValue(/\*{4}/)
  await expect(keyField).not.toHaveValue(apiKey)
  await edit.getByRole('textbox', { name: '模型名称' }).fill(renamed)
  await edit.getByRole('button', { name: '确认更新' }).click()
  await expect(edit).toBeHidden()

  await page.reload()
  const renamedRow = page.getByRole('row').filter({ hasText: renamed })
  await expect(renamedRow).toBeVisible()

  await renamedRow.getByRole('button', { name: '删除' }).click()
  await page.getByRole('tooltip').getByRole('button', { name: '确定' }).click()
  await expect(renamedRow).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'Journey Mock' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: MODEL_PREFIX })).toHaveCount(0)
})
