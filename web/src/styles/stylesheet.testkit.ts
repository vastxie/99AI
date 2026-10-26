import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { compileStyle, parse as parseSfc } from 'vue/compiler-sfc'

/**
 * 样式契约测试工具：把真实的共享样式层（tokens / 明暗主题 / components …）
 * 用生产同款 Tailwind 管线编译后注入 happy-dom，用 getComputedStyle 读取
 * token 级联的最终结果，而不是对样式源码做字符串断言。
 */
const chatRoot = process.cwd()
const require = createRequire(import.meta.url)

export const readStyle = (file: string) => readFileSync(resolve(chatRoot, file), 'utf8')

/** 与 src/styles/index.css 的 @import 顺序一致（不含 base 重置，避免干扰 token 断言） */
export const DESIGN_SYSTEM_FILES = [
  'src/styles/tokens.css',
  'src/styles/themes/light.css',
  'src/styles/themes/dark.css',
  'src/styles/z-index.css',
  'src/styles/components.css',
  'src/styles/recipes.css',
  'src/styles/sidebar.css',
  'src/styles/composer.css',
  'src/styles/message.css',
  'src/styles/model-selector.css',
  'src/styles/discrete-slider.css',
  'src/styles/motion.css',
]

const compiled = new Map<string, Promise<string>>()

/**
 * 编译共享样式层。raw 里的类名 / files 里的源文件会参与 Tailwind 扫描，
 * 因此 recipes.css 里 components 层的组件类（.btn-* / .chat-code-block …）只有被引用才会输出，
 * 与生产构建一致。
 */
export function compileDesignSystem(options: { raw?: string; files?: string[] } = {}) {
  const key = JSON.stringify(options)
  let pending = compiled.get(key)
  if (!pending) {
    pending = postcss([
      tailwindcss({
        content: [
          ...(options.files ?? []).map(file => resolve(chatRoot, file)),
          { raw: options.raw ?? '', extension: 'html' },
        ],
        presets: [require(resolve(chatRoot, 'tailwind.config.js'))],
      }),
    ])
      .process(
        `${DESIGN_SYSTEM_FILES.map(readStyle).join('\n')}\n@tailwind components;\n@tailwind utilities;`,
        { from: undefined }
      )
      .then(result => result.css)
    compiled.set(key, pending)
  }
  return pending
}

/**
 * 编译单文件组件自带的 <style> 块：vitest 默认不处理 CSS，组件 scoped 样式在 happy-dom 里读不到计算值。
 * scoped 块需要传挂载后根元素上的 data-v-* 作用域属性名（见 scopeIdOf），与模板编译出的作用域一致；
 * 只有非 scoped 块的组件可不传。
 */
export function compileComponentStyles(file: string, scopeId?: string) {
  const filename = resolve(chatRoot, file)
  const { descriptor } = parseSfc(readStyle(file), { filename })
  return descriptor.styles
    .map(block => {
      if (block.scoped && !scopeId) {
        throw new Error(`${file} 带 scoped 样式，需要传入挂载后根元素的 data-v-* 作用域 id`)
      }
      const result = compileStyle({
        source: block.content,
        filename,
        id: scopeId ?? '',
        scoped: Boolean(block.scoped),
      })
      if (result.errors.length) throw result.errors[0]
      return result.code
    })
    .join('\n')
}

/** 挂载后根元素上的 data-v-* 作用域属性名；组件没有 scoped 样式时为 undefined */
export function scopeIdOf(element: Element) {
  return Array.from(element.attributes).find(attr => attr.name.startsWith('data-v-'))?.name
}

/** 注入样式表，返回移除函数 */
export function installStylesheet(css: string) {
  const style = document.createElement('style')
  style.setAttribute('data-stylesheet-testkit', '')
  style.textContent = css
  document.head.appendChild(style)
  return () => style.remove()
}

/** 挂一个带 class 的元素读计算样式，用完记得 remove */
export function mountProbe(className: string, parent: Element = document.body, tag = 'div') {
  const element = document.createElement(tag)
  element.className = className
  parent.appendChild(element)
  return element
}

export const computedStyle = (element: Element) => window.getComputedStyle(element)

/**
 * 读自定义属性；未定义的 `--x` 直接抛错，避免 `expect(rootVar(a)).toBe(rootVar(b))` 在两边都被删掉时
 * 以 '' === '' 空洞通过。确实要探测“是否定义”用 optionalCssVar。
 */
export const cssVar = (element: Element, name: string) => {
  const value = optionalCssVar(element, name)
  if (name.startsWith('--') && value === '') {
    throw new Error(`自定义属性 ${name} 在该上下文里没有解析出值（未定义或为空）`)
  }
  return value
}

export const optionalCssVar = (element: Element, name: string) =>
  computedStyle(element).getPropertyValue(name).trim()

export const rootVar = (name: string) => cssVar(document.documentElement, name)

/**
 * happy-dom 只返回声明在元素自身规则上的自定义属性；要读“在这个元素的上下文里
 * var(--name) 会解析成什么”（含祖先作用域覆盖），就挂一个临时子节点把它拷进来。
 */
export function resolveVar(element: Element, name: string) {
  const probe = document.createElement('span')
  probe.style.setProperty('--stylesheet-testkit-probe', `var(${name})`)
  element.appendChild(probe)
  try {
    return cssVar(probe, '--stylesheet-testkit-probe')
  } finally {
    probe.remove()
  }
}

/** 计算样式把 rem 换成了 px（16px 基准）；比较 token 原文时先做同样的换算 */
export const toPx = (value: string) =>
  value.replace(/(\d*\.?\d+)rem\b/g, (_, rem: string) => `${parseFloat(rem) * 16}px`)

export const squash = (value: string) => value.replace(/\s+/g, ' ').trim()

/** 拆 transition 简写：每项 [property, duration, timing...]，忽略 delay 细节 */
export function parseTransitions(value: string) {
  return splitTopLevel(squash(value))
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      // cubic-bezier(...) / steps(...) 里带空格与逗号，按函数整体切 token
      const tokens = item.match(/[a-z-]+\([^)]*\)|\S+/gi) ?? []
      return {
        property: tokens[0],
        duration: tokens.find(token => /^\d*\.?\d+m?s$/.test(token)) ?? '',
        timing: tokens.find(token => /^(?:cubic-bezier\(|ease|linear|steps\()/.test(token)) ?? '',
      }
    })
}

export function withDarkTheme<T>(run: () => T): T {
  document.documentElement.classList.add('dark')
  try {
    return run()
  } finally {
    document.documentElement.classList.remove('dark')
  }
}

export type Rgba = [number, number, number, number]

/** 解析 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba()（空格或逗号分隔）/ transparent */
export function parseColor(value: string): Rgba {
  const text = value.trim().toLowerCase()
  if (text === 'transparent') return [0, 0, 0, 0]
  const hex = text.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) digits = [...digits].map(char => char + char).join('')
    const channels = digits.match(/../g)!.map(pair => parseInt(pair, 16))
    return [channels[0], channels[1], channels[2], channels.length > 3 ? channels[3] / 255 : 1]
  }
  const fn = text.match(/^rgba?\((.+)\)$/)
  if (fn) {
    const [colors, alpha] = fn[1].split('/')
    const parts = colors
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    const alphaValue = alpha !== undefined ? Number(alpha) : (parts[3] ?? 1)
    return [parts[0], parts[1], parts[2], Number.isFinite(alphaValue) ? alphaValue : 1]
  }
  throw new Error(`Unsupported color value: ${value}`)
}

/**
 * 解析 color-mix(in srgb, A P%, B [Q%])；主题层只在 srgb 里按百分比混合两色，
 * 其它写法视为普通颜色。
 */
export function resolveColor(value: string): Rgba {
  const text = value.trim()
  const mix = text.match(/^color-mix\(in srgb,\s*(.+)\)$/i)
  if (!mix) return parseColor(text)
  const args = splitTopLevel(mix[1])
  if (args.length !== 2) throw new Error(`Unsupported color-mix: ${value}`)
  const [first, second] = args.map(arg => {
    const match = arg.trim().match(/^(.*?)(?:\s+([\d.]+)%)?$/)!
    return {
      color: resolveColor(match[1]),
      amount: match[2] === undefined ? NaN : Number(match[2]) / 100,
    }
  })
  let a = first.amount
  let b = second.amount
  if (Number.isNaN(a) && Number.isNaN(b)) a = b = 0.5
  else if (Number.isNaN(a)) a = 1 - b
  else if (Number.isNaN(b)) b = 1 - a
  const total = a + b
  const [wa, wb] = [a / total, b / total]
  const alpha = first.color[3] * wa + second.color[3] * wb
  const channel = (index: 0 | 1 | 2) =>
    alpha === 0
      ? 0
      : (first.color[index] * first.color[3] * wa + second.color[index] * second.color[3] * wb) /
        alpha
  return [channel(0), channel(1), channel(2), alpha]
}

function splitTopLevel(text: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

/** 把带透明度的前景色叠到底色上，得到实际显示色 */
export function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground[3]
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
    1,
  ]
}

export function relativeLuminance([r, g, b]: Rgba) {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrastRatio(foreground: Rgba, background: Rgba) {
  const fg = relativeLuminance(composite(foreground, background))
  const bg = relativeLuminance(background)
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
}

/** 是否为不透明的实色（hex 或不带透明度的 rgb），排除 color-mix / transparent / 半透明 */
export function isOpaqueColor(value: string) {
  try {
    if (/color-mix|transparent/i.test(value)) return false
    return parseColor(value)[3] === 1
  } catch {
    return false
  }
}
