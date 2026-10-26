import { expect, test, type Locator } from '@playwright/test'
import { registerUser } from './support/api'
import { login, send } from './support/app'

/** 量一张表：每个单元格的文字排成了几行，表格与页面各自横向溢出多少 */
function measure(table: Locator) {
  return table.evaluate((element: HTMLTableElement) => {
    const lineCount = (cell: Element) => {
      const range = document.createRange()
      range.selectNodeContents(cell)
      return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size
    }
    const cells = [...element.querySelectorAll('th, td')].map(cell => ({
      text: cell.textContent || '',
      lines: lineCount(cell),
    }))
    return {
      // 四个字以内算短单元格
      wrappedShortCells: cells.filter(cell => cell.text.length <= 4 && cell.lines !== 1),
      shortCells: cells.filter(cell => cell.text.length <= 4).length,
      longCells: cells.filter(cell => cell.text.length > 4),
      tableOverflow: element.scrollWidth - element.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
}

test('手机宽度下回复里的表格：短的列不被拆成一字一行，放不下时整张表横向滚动', async ({ page }) => {
  const user = await registerUser()
  await login(page, user)
  await page.setViewportSize({ width: 390, height: 844 })
  await send(page, '列两张表 [mock:table]')
  const tables = page.getByRole('table')
  await expect(tables).toHaveCount(2)

  // 三列表（两列短、一列长）：短单元格都是一行，长文字正常折行，整张表不用滚动就能看全
  const three = await measure(tables.nth(0))
  expect(three.shortCells).toBe(9)
  expect(three.wrappedShortCells).toEqual([])
  for (const cell of three.longCells) {
    expect(cell.lines).toBeLessThanOrEqual(Math.ceil(cell.text.length / 6))
  }
  expect(three.tableOverflow).toBeLessThanOrEqual(1)

  // 五列表放不下：整张表横向滚动，短单元格仍然是一行
  const five = await measure(tables.nth(1))
  expect(five.shortCells).toBeGreaterThanOrEqual(10)
  expect(five.wrappedShortCells).toEqual([])
  expect(five.tableOverflow).toBeGreaterThan(0)

  // 页面本身不横向溢出
  expect(five.pageOverflow).toBeLessThanOrEqual(0)
})
