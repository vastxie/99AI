import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

/**
 * 减弱动效的覆盖与默认动画选择器相同时，只有写在后面的才生效（层叠按出现顺序）。
 * 逐条核对：每个在 reduced-motion 里关掉动画的选择器，覆盖都出现在该选择器最后一条默认动画之后
 */
describe('reduced-motion overrides come after the animations they cancel', () => {
  it('chat-page.css', () => {
    const root = postcss.parse(readFileSync(resolve(__dirname, 'chat-page.css'), 'utf8'))
    const lastDefault = new Map<string, number>()
    const overrides: Array<{ selector: string; at: number }> = []
    root.walkRules((rule: Rule) => {
      const inReduced =
        rule.parent?.type === 'atrule' &&
        /prefers-reduced-motion:\s*reduce/u.test((rule.parent as postcss.AtRule).params)
      const animated = rule.nodes.some(
        node =>
          node.type === 'decl' && /^animation(-name)?$/u.test(node.prop) && node.value !== 'none'
      )
      const cancelled = rule.nodes.some(
        node => node.type === 'decl' && node.prop === 'animation' && node.value === 'none'
      )
      for (const selector of rule.selectors) {
        const at = rule.source?.start?.offset ?? 0
        if (!inReduced && animated) lastDefault.set(selector, at)
        if (inReduced && cancelled) overrides.push({ selector, at })
      }
    })
    expect(overrides.some(item => item.selector === '.older-message-loading span')).toBe(true)
    for (const { selector, at } of overrides) {
      const defaultAt = lastDefault.get(selector)
      if (defaultAt !== undefined)
        expect({ selector, after: at > defaultAt }).toEqual({ selector, after: true })
    }
  })
})
