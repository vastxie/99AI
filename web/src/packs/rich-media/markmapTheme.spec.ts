import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import {
  compileDesignSystem,
  computedStyle,
  contrastRatio,
  installStylesheet,
  mountProbe,
  readStyle,
  resolveColor,
  rootVar,
  withDarkTheme,
} from '@/styles/stylesheet.testkit'

const require = createRequire(import.meta.url)

/** markmap-view 在运行时注入的 .markmap 规则，从安装的库里取（库升级时测试跟着变） */
function markmapLibraryRule() {
  const source = readFileSync(require.resolve('markmap-view'), 'utf8')
  const rule = source.match(/\.markmap\{[^}]*\}/)
  if (!rule) throw new Error('markmap-view 里没有找到 .markmap 规则')
  return rule[0]
}

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

async function install() {
  cleanups.push(installStylesheet(await compileDesignSystem()))
  cleanups.push(installStylesheet(readStyle('src/packs/rich-media/markmap-theme.css')))
  // 库的样式在运行时才注入，排在站点样式之后
  cleanups.push(installStylesheet(markmapLibraryRule()))
  const svg = mountProbe('markmap', document.body, 'svg')
  cleanups.push(() => svg.remove())
  return svg
}

describe('思维导图配色跟随主题', () => {
  it('深色主题下节点文字用主题文字色，在表面色上清晰可读（库默认是 #333，几乎看不见）', async () => {
    const svg = await install()
    withDarkTheme(() => {
      const text = resolveColor(computedStyle(svg).color)
      expect(text).toEqual(resolveColor(rootVar('--text-primary')))
      expect(contrastRatio(text, resolveColor(rootVar('--app-surface')))).toBeGreaterThan(7)
    })
  })

  it('浅色主题同样取主题文字色', async () => {
    const svg = await install()
    expect(resolveColor(computedStyle(svg).color)).toEqual(resolveColor(rootVar('--text-primary')))
  })
})
