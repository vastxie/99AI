import { mount } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import MenuItem from '@/components/common/DropdownMenu/MenuItem.vue'
import {
  compileDesignSystem,
  computedStyle,
  installStylesheet,
  mountProbe,
  resolveVar,
  rootVar,
  withDarkTheme,
} from './stylesheet.testkit'

let compiledCss = ''
let removeStyles: () => void

beforeAll(async () => {
  compiledCss = await compileDesignSystem({
    raw: 'fg-control fg-quiet fg-link fg-link-muted btn btn-ghost btn-danger menu-item menu-item-active menu-item-danger ui-button settings-inline-action text-semantic-warning btn-icon-action',
  })
  removeStyles = installStylesheet(compiledCss)
})

afterAll(() => {
  removeStyles()
})

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.classList.remove('dark')
})

function inBothThemes(check: (theme: 'light' | 'dark') => void) {
  check('light')
  withDarkTheme(() => check('dark'))
}

describe('全用户端前景角色契约（计算样式）', () => {
  it('普通操作 hover 是辅助色，不和正文/选中共用最深色', () => {
    inBothThemes(theme => {
      expect(rootVar('--control-fg-hover'), theme).toBe(rootVar('--text-secondary'))
      expect(rootVar('--control-fg-quiet'), theme).toBe(rootVar('--text-muted'))
      expect(rootVar('--control-fg-selected'), theme).toBe(rootVar('--text-primary'))
      expect(rootVar('--control-fg-hover'), theme).not.toBe(rootVar('--text-primary'))
      expect(rootVar('--btn-icon-action-text-hover'), theme).toBe(rootVar('--control-fg-hover'))
      expect(rootVar('--menu-item-text-hover'), theme).toBe(rootVar('--control-fg-hover'))
      expect(rootVar('--input-text'), theme).toBe(rootVar('--text-primary'))
    })
  })

  it('明暗主题只决定色值，不重新定义组件交互职责', () => {
    const semanticText: Record<string, string[]> = {}
    inBothThemes(theme => {
      for (const role of ['success', 'warning', 'danger', 'info']) {
        const value = rootVar(`--semantic-${role}-text`)
        expect(value, `${theme} ${role}`).toMatch(/^#[0-9a-f]{6}$/i)
        ;(semanticText[role] ||= []).push(value)
      }
      expect(rootVar('--btn-text-primary'), theme).toBe(rootVar('--text-on-accent'))
      expect(rootVar('--btn-text-ghost'), theme).toBe(rootVar('--control-fg'))
    })
    for (const [role, values] of Object.entries(semanticText)) {
      expect(values[0], role).not.toBe(values[1])
    }
  })

  it('菜单标题、选择标记、箭头继承宿主，危险/禁用不被子图标覆盖', async () => {
    const active = mount(MenuItem, { props: { active: true, title: '当前项' } })
    expect(active.get('svg.menu-item-accessory').classes()).toContain('text-inherit')
    await active.setProps({ active: false, showArrow: true })
    expect(active.get('svg.menu-item-accessory').classes()).toContain('text-inherit')
    active.unmount()

    // 危险项文字走控件危险前景 token，同时也是语义危险文字色
    expect(rootVar('--menu-item-danger-text')).toBe(rootVar('--control-danger-fg'))
    expect(rootVar('--control-danger-fg')).toBe(rootVar('--semantic-danger-text'))
    expect(compiledCss).toMatch(/\.menu-item-danger\s*\{[^}]*color:\s*var\(--menu-item-danger-text/)
    const danger = mountProbe('menu-item menu-item-danger', document.body, 'button')
    ;(danger as HTMLButtonElement).disabled = true
    expect(computedStyle(danger).color).toBe(rootVar('--control-fg-disabled'))
    expect(computedStyle(danger).cursor).toBe('not-allowed')
    const disabledItem = mountProbe('menu-item menu-item-active', document.body, 'button')
    disabledItem.setAttribute('aria-disabled', 'true')
    expect(computedStyle(disabledItem).color).toBe(rootVar('--control-fg-disabled'))
    // 禁用项里的图标 / 文字继承宿主色，而不是各自再上色
    expect(compiledCss).toMatch(
      /:is\(\.btn,\s*\.menu-item\):is\(:disabled,\s*\[aria-disabled=['"]true['"]\]\)\s*:where\([^)]*svg[^)]*\)\s*\{\s*color:\s*inherit/
    )
  })

  it('链接、轻量操作与禁用状态都从公共层提供，包含键盘焦点', () => {
    for (const role of ['fg-control', 'fg-quiet', 'fg-link', 'fg-link-muted']) {
      const escaped = role.replace(/-/g, '\\-')
      expect(compiledCss, role).toMatch(
        new RegExp(
          `\\.${escaped}:hover:not\\(:disabled\\):not\\(\\[aria-disabled=['"]true['"]\\]\\)`
        )
      )
      expect(compiledCss, role).toMatch(
        new RegExp(
          `\\.${escaped}:focus-visible:not\\(:disabled\\):not\\(\\[aria-disabled=['"]true['"]\\]\\)`
        )
      )
    }
    expect(computedStyle(mountProbe('fg-quiet', document.body, 'span')).color).toBe(
      rootVar('--control-fg-quiet')
    )
    expect(computedStyle(mountProbe('fg-link', document.body, 'a')).color).toBe(
      rootVar('--text-link')
    )
    const icon = mountProbe('btn ui-button btn-ghost ui-button-icon', document.body, 'button')
    expect(resolveVar(icon, '--btn-text-ghost')).toBe(rootVar('--control-fg-quiet'))
    expect(computedStyle(icon).color).toBe(rootVar('--control-fg-quiet'))
  })

  it('生产扫描生成公共前景类、disabled 优先规则与语义文本类', () => {
    expect(compiledCss).toContain('.fg-quiet')
    expect(compiledCss).toContain('color: var(--control-fg-hover)')
    expect(compiledCss).toContain('color: var(--semantic-warning-text)')
    expect(compiledCss).toContain('.btn.btn.btn-ghost:disabled')
    expect(compiledCss).toContain('.menu-item-danger:hover:not(:disabled)')
    expect(compiledCss).toContain('color: var(--control-danger-fg)')
  })
})
