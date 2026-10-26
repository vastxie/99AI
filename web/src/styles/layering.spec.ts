import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  compileDesignSystem,
  computedStyle,
  installStylesheet,
  mountProbe,
  rootVar,
} from './stylesheet.testkit'

const root = process.cwd()
const require = createRequire(import.meta.url)

/**
 * 按 index.css 的引入顺序拼出整套全局样式，带上 Tailwind 的 base / components / utilities。
 * 不给 raw 时按生产构建的 content 配置扫描真实源码
 */
async function compileAppStyles(raw?: string) {
  const index = readFileSync(resolve(root, 'src/styles/index.css'), 'utf8')
  const imports = [...index.matchAll(/@import '\.\/([^']+)';/g)].map(match =>
    readFileSync(resolve(root, 'src/styles', match[1]), 'utf8')
  )
  const configPath = resolve(root, 'tailwind.config.js')
  const result = await postcss([
    tailwindcss(
      raw === undefined
        ? configPath
        : { content: [{ raw, extension: 'html' }], presets: [require(configPath)] }
    ),
  ]).process(
    `${imports.join('\n')}\n@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
    {
      from: undefined,
    }
  )
  // 去掉注释，断言只看规则本身
  return result.css.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('全局样式的层序', () => {
  it('元素级默认排在 preflight 之后：字体特性、焦点环、明暗主题的原生控件不被它盖掉', async () => {
    // base 层的规则同样按用到的类输出：生产构建里 dark 类由主题切换写在 <html> 上
    const css = await compileAppStyles(
      '<html class="dark"><div class="group-btn tooltip"></div></html>'
    )
    const preflightHtml = css.indexOf('line-height: 1.5;')
    const preflightFocusRing = css.indexOf(':-moz-focusring')
    expect(preflightHtml).toBeGreaterThan(-1)
    expect(css.indexOf("'kern' 1")).toBeGreaterThan(preflightHtml)
    expect(css.indexOf('*:focus-visible')).toBeGreaterThan(preflightFocusRing)
    expect(css).toMatch(/:root\s*\{\s*color-scheme: light;\s*accent-color: var\(--accent\);/)
    expect(css).toMatch(/:root\.dark\s*\{\s*color-scheme: dark;/)
  })

  it('按生产构建的 content 配置扫描真实源码：提示气泡的四个方位类都会输出', async () => {
    // components 层只输出源码里出现过原文的类；拼接出来的类名扫不到，会在生产构建里被清掉
    const css = await compileAppStyles()
    for (const placement of ['top', 'bottom', 'left', 'right']) {
      expect(css).toMatch(new RegExp(`\\.tooltip-${placement} \\{`))
    }
  }, 60_000)

  it('组件配方只来自 recipes.css：插件不再登记组件，不会再出现两份同名定义', async () => {
    const config = readFileSync(resolve(root, 'tailwind.config.js'), 'utf8')
    expect(config).not.toMatch(/addComponents|addUtilities|addBase/)
    const css = await compileAppStyles('<span class="tooltip"></span>')
    expect(css.match(/\.tooltip \{[^}]*position: absolute/g)).toHaveLength(1)
    expect(css).not.toContain('z-index: 9999')
  })
})

describe('提示气泡', () => {
  let removeStyles: () => void
  let css = ''

  beforeAll(async () => {
    css = await compileDesignSystem({
      raw: '<span class="group-btn action-icon-wrap group tooltip tooltip-top"></span>',
    })
    removeStyles = installStylesheet(css)
  })

  afterAll(() => removeStyles())

  it('只在悬停或键盘聚焦（focus-visible）时出现：鼠标点击留下的焦点不触发，出现后也不挡相邻控件', () => {
    expect(css).not.toContain(':focus-within > .tooltip')
    expect(css).toMatch(/\.group-btn:has\(:focus-visible\) > \.tooltip/)
    expect(css).toMatch(/\.action-icon-wrap:hover > \.tooltip/)
    expect(css).not.toMatch(/\.tooltip[^{]*\{[^}]*pointer-events: auto/)

    const host = mountProbe('group-btn')
    const tip = mountProbe('tooltip tooltip-top', host, 'span')
    try {
      expect(computedStyle(tip).pointerEvents).toBe('none')
      expect(computedStyle(tip).zIndex).toBe(rootVar('--z-tooltip'))
      expect(computedStyle(host).position).toBe('relative')
    } finally {
      host.remove()
    }
  })

  it('挂到 body 的菜单档位高于弹窗、抽屉、底部面板与图片预览，低于确认框与全局消息', () => {
    const z = (name: string) => Number(rootVar(name))
    const overlay = z('--z-menu-overlay')
    for (const below of [
      '--z-dialog',
      '--z-dialog-elevated',
      '--z-sidebar-drawer',
      '--z-sheet',
      '--z-image-viewer',
    ]) {
      expect(overlay, below).toBeGreaterThan(z(below))
    }
    for (const above of ['--z-confirm', '--z-critical', '--z-global-message']) {
      expect(overlay, above).toBeLessThan(z(above))
    }
  })

  it('悬停等待时长统一由 --tooltip-show-delay 给出（图标按钮与其它宿主一致）', () => {
    expect(rootVar('--tooltip-show-delay')).toBe('450ms')
    expect(css).toMatch(
      /\.group-btn:hover > \.tooltip,\s*\.group:hover > \.tooltip,\s*\.action-icon-wrap:hover > \.tooltip\s*\{[^}]*transition-delay: var\(--tooltip-show-delay\)/
    )
  })
})
