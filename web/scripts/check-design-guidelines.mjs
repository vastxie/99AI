#!/usr/bin/env node
/**
 * 用户端设计规约守卫：只扫源码就能保证的设计系统不变量（颜色只来自 token、
 * 动效变量单源、带位移动效要有减弱动效覆盖、层级只用 z-index token、字号与圆角只用刻度、
 * 单一明暗主题机制、样式只用 CSS 不引入预处理器等）。
 * 能在 happy-dom 里观察到的行为（class 切换、计算样式、props / emits）归 vitest，不放这里。
 *
 * 用法（在 web/ 目录下）：
 *   pnpm check:design [文件...]
 *   不传文件时全量扫描 src 下的 .vue / .css（.ts 与 tailwind.config.js 只查主题双机制、变量定义、
 *   主色阶与分层类拼接），
 *   传入文件路径时只报告这些文件的问题（跨文件规则仍以全量为语料）。
 *   仓库没有 pre-commit hook，提交前自行执行；CI（web.yml）同款。
 *
 * 单行豁免：在该行加注释 `design-guard-allow`。
 * 整文件豁免见下方 FILE_EXEMPTIONS（必须写明理由）；DESIGN_GUARD_SHOW_EXEMPT=1 可把被豁免的现存违规一并列出。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'

/** web/ 目录由脚本位置决定，不依赖 cwd */
const CHAT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_ROOT = join(CHAT_ROOT, 'src')
const TAILWIND_CONFIG = join(CHAT_ROOT, 'tailwind.config.js')

/** 允许写颜色字面量的调色板文件：其余样式只能 var(--token) */
const PALETTE_FILES = [
  'src/styles/tokens.css',
  'src/styles/themes/light.css',
  'src/styles/themes/dark.css',
]

/** 层级数值的唯一登记处 */
const Z_INDEX_SOURCE = 'src/styles/z-index.css'

/** 主题文件允许重定义的 tokens 别名（键为变量名，值为理由） */
const THEME_OVERRIDE_ALLOW = {
  '--text-on-accent': '深色主题的强调色更浅，需要用反白（深）文字；tokens 只给浅色默认值',
}

/**
 * 位移过渡只由 (prefers-reduced-motion: no-preference) 门控的 hover 规则触发、
 * reduce 下属性本身不变化的类：守卫按类名找覆盖识别不了这种间接门控，逐个登记理由。
 */
const REDUCED_MOTION_GATED = {
  'sidebar-motion-icon':
    'sidebar.css：图标 transform 只在 @media (hover: hover) and (prefers-reduced-motion: no-preference) 的 hover 规则里改变',
}

/** 引用了但全仓库无定义的变量（现存，登记待处理；键为变量名，值为理由 / 去向） */
/** 未定义变量的登记豁免（键为变量名，值为理由）；落地时揪出的 3 处已在源码里修掉，当前为空 */
const UNDEFINED_VAR_ALLOW = {}

/**
 * 整文件豁免：键为相对 web/ 的路径后缀，值为 { rules, reason }。
 * 标注「现存」的是本守卫落地时揪出的既有违规，只登记不改源码，由协调者决定去向。
 */
const FILE_EXEMPTIONS = {}

/** transition 里这些属性会产生位移 / 尺寸 / 模糊变化，减弱动效时必须有覆盖 */
const MOTION_PROPERTIES = new Set([
  'all',
  'transform',
  'translate',
  'scale',
  'rotate',
  'filter',
  'backdrop-filter',
  'width',
  'height',
  'max-width',
  'max-height',
  'min-width',
  'min-height',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-inline',
  'padding-block',
  'gap',
  'flex-basis',
  'grid-template-columns',
  'grid-template-rows',
  'clip-path',
  'letter-spacing',
  'font-size',
  'line-height',
])

const problems = []
const report = (file, line, rule, message) => problems.push({ file, line, rule, message })

/* ---------------------------------------------------------------- 文件收集 */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') walk(full, out)
    } else {
      out.push(full)
    }
  }
  return out
}

const toRel = file => relative(CHAT_ROOT, file).split(sep).join('/')
const isVue = file => file.endsWith('.vue')
const isStyleFile = file => file.endsWith('.css')
const isScript = file =>
  (file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.endsWith('.spec.ts')) ||
  file === TAILWIND_CONFIG
/** 样式只用 CSS：预处理器源文件与 <style lang="…"> 块一律报出 */
const PREPROCESSOR_FILE = /\.(?:less|scss|sass|styl)$/i
const PREPROCESSOR_LANG = /\blang\s*=\s*["']?(?:less|scss|sass|stylus)\b/i

const srcFiles = walk(SRC_ROOT)
const allFiles = srcFiles.filter(file => isVue(file) || isStyleFile(file) || isScript(file))
allFiles.push(TAILWIND_CONFIG)

/* ---------------------------------------------------------------- 文本上下文 */

/** 把注释替换成等长空白（保留换行，行号不变） */
const blank = text => text.replace(/[^\n]/g, ' ')
const ALLOW_MARKER = 'design-guard-allow'
/** 抹掉注释但保留行数；带豁免标记的注释把标记留在原行，单行豁免才能在去注释后的文本里生效 */
const blankComment = comment =>
  comment.includes(ALLOW_MARKER)
    ? ALLOW_MARKER + blank(comment).replace(/^[^\n]*/, '')
    : blank(comment)
const stripBlockComments = text => text.replace(/\/\*[\s\S]*?\*\//g, blankComment)
const stripHtmlComments = text => text.replace(/<!--[\s\S]*?-->/g, blankComment)
const stripLineComments = text =>
  text.replace(
    /(^|[^:'"])\/\/[^\n]*/g,
    (match, lead) => lead + blankComment(match.slice(lead.length))
  )

const lineAt = (text, index) => text.slice(0, index).split('\n').length

/**
 * 每个文件拆成若干上下文：kind 为 css（.css 整文件）、style（.vue <style>）、
 * template（.vue <template>）、script（.vue <script> / .ts / .js）。
 */
function contextsOf(file, source) {
  if (isStyleFile(file)) {
    return [{ kind: 'css', text: stripBlockComments(source), startLine: 1 }]
  }
  if (!isVue(file)) {
    return [{ kind: 'script', text: stripBlockComments(stripLineComments(source)), startLine: 1 }]
  }
  const contexts = []
  const template = source.match(/^<template\b[^>]*>([\s\S]*?)^<\/template>/m)
  if (template) {
    contexts.push({
      kind: 'template',
      text: stripHtmlComments(template[1]),
      startLine: lineAt(source, template.index + template[0].indexOf('>') + 1),
    })
  }
  for (const match of source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)) {
    contexts.push({
      kind: 'style',
      // 顶格的才是 SFC 样式块；脚本字符串里拼的 <style>（如预览 iframe 的 srcdoc）不算
      sfcBlock: match.index === 0 || source[match.index - 1] === '\n',
      attrs: match[1],
      text: stripBlockComments(match[2]),
      startLine: lineAt(source, match.index + match[0].indexOf('>') + 1),
    })
  }
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    contexts.push({
      kind: 'script',
      text: stripBlockComments(stripLineComments(match[1])),
      startLine: lineAt(source, match.index + match[0].indexOf('>') + 1),
    })
  }
  return contexts
}

const isCssLike = context => context.kind === 'css' || context.kind === 'style'

/** 遍历上下文的每一行，跳过带 design-guard-allow 的行 */
function eachLine(context, callback) {
  context.text.split('\n').forEach((line, index) => {
    if (line.includes('design-guard-allow')) return
    callback(line, context.startLine + index)
  })
}

/** 多行匹配：回调拿到匹配串与所在行（该行带 design-guard-allow 则跳过） */
function eachMatch(context, regex, callback) {
  for (const match of context.text.matchAll(regex)) {
    const line = context.startLine + lineAt(context.text, match.index) - 1
    const lineText = context.text.split('\n')[lineAt(context.text, match.index) - 1] || ''
    if (lineText.includes('design-guard-allow')) continue
    callback(match, line)
  }
}

/* ---------------------------------------------------------------- 组件配方单一来源 */

const RECIPES_FILE = 'src/styles/recipes.css'

/** 选择器列表按顶层逗号切开（:is() / :where() 里的逗号不切） */
function splitSelectorList(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  parts.push(current.trim())
  return parts.filter(Boolean)
}

/** 一段 CSS 里以「.类名」单独作选择器（类的基础定义）出现的类名与行号 */
function baseClassDefinitions(text) {
  const found = []
  for (const match of text.matchAll(/([^{}@;]+)\{/g)) {
    for (const selector of splitSelectorList(match[1])) {
      if (/^\.[A-Za-z][\w-]*$/.test(selector)) {
        found.push({ name: selector, line: lineAt(text, match.index + match[0].length - 1) })
      }
    }
  }
  return found
}

/*
 * 组件配方（按钮、提示气泡、菜单、卡片等）只在 styles/recipes.css 定义一次：以前 tailwind.config.js 的插件和
 * components.css 各有一份同名定义，插件版因层序在后静默生效，改 CSS 看不到效果（提示气泡的显示条件、
 * 设置卡片的边框都因此被改写）。插件不再登记组件，recipes.css 里定义的类也不在别的全局样式文件里再定义基础规则。
 */
function checkRecipeSingleSource(fileContexts, sources) {
  const config = sources.get('tailwind.config.js') ?? ''
  for (const match of config.matchAll(
    /\b(?:addComponents|addUtilities|addBase|matchComponents|matchUtilities)\b/g
  )) {
    report(
      'tailwind.config.js',
      lineAt(config, match.index),
      'recipe-single-source',
      '组件配方写在 styles/recipes.css（@layer components），tailwind.config.js 只做 token 到工具类的映射'
    )
  }
  const recipes = fileContexts.find(({ rel }) => rel === RECIPES_FILE)
  if (!recipes) return
  const recipeNames = new Set(
    recipes.contexts.flatMap(context => baseClassDefinitions(context.text).map(item => item.name))
  )
  for (const { rel, contexts } of fileContexts) {
    if (rel === RECIPES_FILE || !rel.startsWith('src/styles/') || !rel.endsWith('.css')) continue
    for (const context of contexts) {
      for (const { name, line } of baseClassDefinitions(context.text)) {
        if (!recipeNames.has(name)) continue
        report(
          rel,
          context.startLine + line - 1,
          'recipe-single-source',
          `${name} 已在 ${RECIPES_FILE} 定义，不要在别的全局样式文件里再写一份基础规则（状态、上下文修饰用复合选择器）`
        )
      }
    }
  }
}

/* ---------------------------------------------------------------- 分层类要写字面量 */

/** @layer components / utilities 块的内容（按花括号配对切出来） */
function layerBlocks(text) {
  const blocks = []
  for (const match of text.matchAll(/@layer\s+(?:components|utilities)\s*\{/g)) {
    let depth = 1
    let index = match.index + match[0].length
    const start = index
    while (index < text.length && depth > 0) {
      if (text[index] === '{') depth++
      else if (text[index] === '}') depth--
      index++
    }
    blocks.push(text.slice(start, index - 1))
  }
  return blocks
}

/** 全局样式里分层定义的类的前缀（最后一个短横之前，含短横）：tooltip-top → tooltip- */
function layeredClassPrefixes(fileContexts) {
  const prefixes = new Set()
  for (const { rel, contexts } of fileContexts) {
    if (!rel.startsWith('src/styles/') || !rel.endsWith('.css')) continue
    for (const context of contexts) {
      for (const block of layerBlocks(context.text)) {
        for (const rule of block.matchAll(/([^{};@]+)\{/g)) {
          for (const name of rule[1].matchAll(/\.([A-Za-z][\w-]*-)[\w-]+/g)) prefixes.add(name[1])
        }
      }
    }
  }
  return prefixes
}

const TEMPLATE_CLASS = /([A-Za-z][\w-]*-)\$\{/g
const CONCAT_CLASS = /(['"])([A-Za-z][\w-]*-)\1\s*\+/g

/*
 * @layer components / utilities 里的类只有在源码里出现过原文才会被 Tailwind 输出：模板字符串或字符串相加
 * 拼出来的类名（`tooltip-${placement}`）扫不到，开发环境看着正常，生产构建里整条规则被清掉
 * （提示气泡的方位类就这样丢过）。这类类名写成字面量的映射
 */
function checkLayeredClassLiterals(fileContexts) {
  const prefixes = layeredClassPrefixes(fileContexts)
  const message = prefix =>
    `\`${prefix}\` 开头的类定义在 @layer 里，拼接出来的类名不会被 Tailwind 扫到、生产构建会被清掉：改成写死字面量的映射`
  for (const { rel, contexts } of fileContexts) {
    for (const context of contexts) {
      if (context.kind !== 'template' && context.kind !== 'script') continue
      eachMatch(context, TEMPLATE_CLASS, (match, line) => {
        if (prefixes.has(match[1])) report(rel, line, 'layered-class-literal', message(match[1]))
      })
      eachMatch(context, CONCAT_CLASS, (match, line) => {
        if (prefixes.has(match[2])) report(rel, line, 'layered-class-literal', message(match[2]))
      })
    }
  }
}

/* ---------------------------------------------------------------- 逐文件规则 */

/** var(--x, <fallback>) 的回退字面量不算裸色：token 仍是唯一来源，回退只是防御 */
const dropVarFallbacks = line =>
  line.replace(/var\(\s*--[\w-]+\s*,[^()]*(?:\([^()]*\)[^()]*)*\)/g, 'var(--x)')

const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const COLOR_FN = /\b(?:rgba?|hsla?)\(\s*(?!var\()/

function checkBareColors(rel, contexts) {
  if (PALETTE_FILES.some(file => rel.endsWith(file))) return
  for (const context of contexts) {
    if (context.kind === 'script') continue
    eachLine(context, (rawLine, line) => {
      const text = dropVarFallbacks(rawLine)
      const hex = text.match(HEX_COLOR) || []
      if (hex.length) {
        report(
          rel,
          line,
          'no-bare-color',
          `禁止裸 hex ${hex.join(' ')}（颜色只来自 tokens.css / themes 的 --token）`
        )
      }
      if (COLOR_FN.test(text)) {
        report(
          rel,
          line,
          'no-bare-color',
          '禁止 rgb() / rgba() / hsl() / hsla() 字面量（用 token；透明底用 color-mix(in srgb, var(--token) N%, transparent)）'
        )
      }
    })
  }
}

const FOREGROUND_RULES = [
  [
    /(?:hover|focus):text-/,
    '不要在页面里拼 hover:/focus: 前景色，用 fg-control / fg-quiet / fg-link 等公共前景角色',
  ],
  [
    /\btext-(?:gray|slate|zinc|neutral|primary|blue|red|green)-\d/,
    '不要直接用色阶文字类，用 text-text-* / text-semantic-* 语义角色',
  ],
  [
    /disabled:opacity-|\bopacity-45\b|\bopacity-50\b/,
    '禁用态不靠透明度，用 --control-fg-disabled 等禁用 token',
  ],
]

function checkForegroundShades(rel, contexts) {
  for (const context of contexts) {
    eachLine(context, (line, lineNumber) => {
      for (const [regex, message] of FOREGROUND_RULES) {
        if (regex.test(line)) report(rel, lineNumber, 'no-foreground-shade-utilities', message)
      }
    })
    if (isCssLike(context)) {
      eachMatch(context, /:disabled[^{}]*\{[^{}]*opacity:\s*0?\.\d/g, (_, line) => {
        report(
          rel,
          line,
          'no-foreground-shade-utilities',
          ':disabled 不靠 opacity 变淡，用 --control-fg-disabled 等禁用 token'
        )
      })
      eachMatch(
        context,
        /(?:^|[;\s{])color:\s*(?:var\(--primary-|rgb\(var\(--primary-)/g,
        (_, line) => {
          report(
            rel,
            line,
            'no-foreground-shade-utilities',
            '文字色不要直接取 --primary-* 色阶，用 --text-link / --accent 等语义 token'
          )
        }
      )
    }
  }
}

function checkHoverSurfaceBackground(rel, contexts) {
  for (const context of contexts) {
    if (context.kind !== 'template' && context.kind !== 'script') continue
    eachLine(context, (line, lineNumber) => {
      if (/hover:bg-(?:app-(?:surface|elevated)|panel-subtle)\b/.test(line)) {
        report(
          rel,
          lineNumber,
          'no-hover-surface-bg',
          '普通操作的悬停底色用 --interaction-bg-hover（btn-ghost / menu-item 自带），不要拿画布 / 面板底色当悬停色'
        )
      }
    })
  }
}

function checkUiButtonTags(rel, contexts) {
  for (const context of contexts) {
    if (context.kind !== 'template') continue
    eachMatch(context, /<UiButton\b[^>]*>/g, ([tag], line) => {
      if (/\bbtn-(?:primary|secondary|ghost|danger)\b/.test(tag)) {
        report(
          rel,
          line,
          'no-btn-variant-on-ui-button',
          'UiButton 用 variant 选主次 / 危险态，不要再叠 btn-* 变体类'
        )
      }
      const isIcon = /(?:^|\s)icon(?=[\s/>])/.test(tag)
      if (isIcon && /\b[wh]-(?:\d+(?:\.\d+)?|\[[^\]]+\])\b|\bsize-\d+\b/.test(tag)) {
        report(
          rel,
          line,
          'no-size-utility-on-icon-button',
          '图标按钮尺寸由 UiButton（--control-height / 触控热区）统一管理，不要叠加 w-* / h-* / size-*'
        )
      }
    })
  }
}

const RESPONSIVE_SHOW =
  /(?:^|\s)(?:sm|md|lg|xl|2xl):(?:block|flex|inline-flex|inline-block|inline|grid|table|contents)(?=\s|$)/

function checkHiddenWithResponsiveDisplay(rel, contexts) {
  for (const context of contexts) {
    if (context.kind !== 'template') continue
    eachMatch(context, /class="([^"]*)"|'([^']*)'/g, (match, line) => {
      const classes = match[1] ?? match[2] ?? ''
      if (/(?:^|\s)hidden(?=\s|$)/.test(classes) && RESPONSIVE_SHOW.test(classes)) {
        report(
          rel,
          line,
          'no-hidden-with-responsive-display',
          '全局 .hidden 是 !important，hidden + 断点再显示永远不会显示；改用 max-<bp>:hidden'
        )
      }
    })
  }
}

const THEME_MECHANISM = [
  [
    /--theme-/,
    '不要再引入 --theme-* 覆盖层，明暗只由 themes/light.css 与 themes/dark.css（html.dark）决定',
  ],
  [/\bdata-theme\b|dataset\.theme\b/, '明暗只用 html.dark class 切换，不要并存 data-theme 机制'],
]

function checkSingleThemeMechanism(rel, contexts) {
  for (const context of contexts) {
    eachLine(context, (line, lineNumber) => {
      for (const [regex, message] of THEME_MECHANISM) {
        if (regex.test(line)) report(rel, lineNumber, 'single-theme-mechanism', message)
      }
      if (isCssLike(context) && /\.theme-[a-z]/.test(line)) {
        report(
          rel,
          lineNumber,
          'single-theme-mechanism',
          '不要用 .theme-* 类分主题写样式，颜色差异只放 themes/*.css 的 token'
        )
      }
    })
  }
}

/** Tailwind 默认的数字层级档（含负值）：模板与脚本里拼的类名都查 */
const TAILWIND_NUMERIC_Z = /(?<![\w-])-?z-(?:10|20|30|40|50)(?![\w-])/

function checkZIndex(rel, contexts) {
  if (rel.endsWith(Z_INDEX_SOURCE)) return
  for (const context of contexts) {
    if (context.kind === 'script') {
      eachLine(context, (line, lineNumber) => {
        if (!/['"`]/.test(line) || !TAILWIND_NUMERIC_Z.test(line)) return
        report(
          rel,
          lineNumber,
          'z-index-tokens',
          '类名里的 z-10 到 z-50 是 Tailwind 的默认数字档：页面层级用 z-header / z-content 等语义档位，组件内部的局部堆叠用 z-1 / z-2'
        )
      })
      continue
    }
    eachLine(context, (line, lineNumber) => {
      for (const match of line.matchAll(/z-index\s*:\s*(-?\d+)\b/g)) {
        if (Math.abs(Number(match[1])) >= 10) {
          report(
            rel,
            lineNumber,
            'z-index-tokens',
            `z-index: ${match[1]} 属于全局层级，只能用 var(--z-*)（styles/z-index.css）；局部堆叠只允许 <10 的小整数`
          )
        }
      }
      if (context.kind === 'template' && /(?:^|\s):?z-index\s*=\s*"\s*-?\d/.test(line)) {
        report(
          rel,
          lineNumber,
          'z-index-tokens',
          '组件的 z-index 属性不要传数字，用 var(--z-*) 档位（DropdownMenu 按是否挂到 body 自动选档位）'
        )
      }
      if (context.kind === 'template' && /\bz-\[[^\]]+\]/.test(line)) {
        report(
          rel,
          lineNumber,
          'z-index-tokens',
          '不要用 z-[N] 任意值，用 tailwind.config.js 登记的 z-dialog / z-notification 等语义档位'
        )
      }
      if (context.kind === 'template' && TAILWIND_NUMERIC_Z.test(line)) {
        report(
          rel,
          lineNumber,
          'z-index-tokens',
          'z-10 到 z-50 是 Tailwind 的默认数字档：页面层级用 z-header / z-content / z-composer 等语义档位（styles/z-index.css），组件自己的层叠上下文里的局部堆叠用 z-1 / z-2'
        )
      }
    })
  }
}

/* ---------------------------------------------------------------- 字号与圆角只用刻度 */

/** 写死的长度（px / rem）：em、百分比、var() 与函数表达式不算 */
const LENGTH_LITERAL = /^-?[\d.]+(?:px|rem)$/

/**
 * 字号只用 tokens.css 的 --type-*-size（模板里用 text-xs / text-sm / text-base / text-lg）；
 * 正文排版里相对父级的比例（Markdown 标题、行内代码）写 em。刻度外的确属例外时在该行写 design-guard-allow 与理由
 */
function checkTypeScale(rel, contexts) {
  if (PALETTE_FILES.some(file => rel.endsWith(file))) return
  for (const context of contexts) {
    // 脚本字符串里拼的 <style>（如预览 iframe 的 srcdoc）不是界面样式
    if (context.kind === 'style' && !context.sfcBlock) continue
    eachLine(context, (line, lineNumber) => {
      if (isCssLike(context)) {
        for (const match of line.matchAll(/(?<![\w-])font-size\s*:\s*([^;}]+)/g)) {
          const value = match[1].replace(/\s*!important\s*$/, '').trim()
          if (!LENGTH_LITERAL.test(value)) continue
          report(
            rel,
            lineNumber,
            'type-scale',
            `font-size: ${value} 不在字号刻度上：用 var(--type-*-size)（styles/tokens.css）；正文排版的相对比例写 em`
          )
        }
      }
      if (context.kind === 'template' || context.kind === 'script') {
        for (const match of line.matchAll(/(?<![\w-])text-\[(?:length:)?(-?[\d.]+(?:px|rem))\]/g)) {
          report(
            rel,
            lineNumber,
            'type-scale',
            `${match[0]} 不在字号刻度上：用 text-xs / text-sm / text-base / text-lg`
          )
        }
      }
    })
  }
}

/**
 * 圆角只用 --radius-* 刻度（模板里用 rounded-* 档位）。em、百分比、inherit 不算；嵌套的外圈圆角可以写成
 * calc(内圈圆角 + 内边距)（含 var() 的表达式不查）。刻度外的确属例外时在该行写 design-guard-allow 与理由
 */
function checkRadiusScale(rel, contexts) {
  if (PALETTE_FILES.some(file => rel.endsWith(file))) return
  for (const context of contexts) {
    if (context.kind === 'style' && !context.sfcBlock) continue
    eachLine(context, (line, lineNumber) => {
      if (isCssLike(context)) {
        for (const match of line.matchAll(
          /(?<![\w-])border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius\s*:\s*([^;}]+)/g
        )) {
          const value = match[1].replace(/\s*!important\s*$/, '').trim()
          if (value.includes('var(')) continue
          const literals = value.split(/[\s/]+/).filter(part => LENGTH_LITERAL.test(part))
          if (!literals.some(part => Number.parseFloat(part) !== 0)) continue
          report(
            rel,
            lineNumber,
            'radius-scale',
            `border-radius: ${value} 不在圆角刻度上：用 var(--radius-*)（styles/tokens.css）`
          )
        }
      }
      if (context.kind === 'template' || context.kind === 'script') {
        for (const match of line.matchAll(
          /(?<![\w-])rounded(?:-[a-z]{1,2})?-\[(-?[\d.]+(?:px|rem))\]/g
        )) {
          report(
            rel,
            lineNumber,
            'radius-scale',
            `${match[0]} 不在圆角刻度上：用 rounded-md / rounded-lg / rounded-xl 等档位`
          )
        }
      }
    })
  }
}

function checkTransitionAll(rel, contexts) {
  for (const context of contexts) {
    eachLine(context, (line, lineNumber) => {
      if (isCssLike(context) && /\btransition(?:-property)?\s*:\s*all\b/.test(line)) {
        report(
          rel,
          lineNumber,
          'no-transition-all',
          'transition: all 会把布局属性一起动画化，列出具体属性并使用 --motion-* 时长 token'
        )
      }
      if (context.kind === 'template' || context.kind === 'script') {
        if (/(?:^|[\s'"`])transition-all(?=[\s'"`]|$)/.test(line)) {
          report(
            rel,
            lineNumber,
            'no-transition-all',
            'transition-all 会把布局属性一起动画化，用 transition-colors / transition-opacity 等具体过渡'
          )
        }
        if (/(?:^|[\s'"`:])duration-(?:\d+|\[\d*\.?\d+m?s\])(?=[\s'"`]|$)/.test(line)) {
          report(
            rel,
            lineNumber,
            'motion-duration-token',
            '过渡时长用动效刻度 duration-xs / sm / md / lg / xl / 2xl（对应 --motion-duration-*），没有数字档与字面量'
          )
        }
      }
    })
  }
}

/*
 * 动效时长与缓动只有一套刻度（styles/tokens.css 的 --motion-duration-* 与 --motion-easing）：
 * 过渡与短动画（400ms 以内的入场、淡入淡出）不写时长字面量；循环、装饰性的长动画（转圈、闪光、波浪）不受限。
 * 0 / 1ms（减弱动效时关掉过渡）不算。只看时长，不看延迟（逐个错开的延迟照写）
 */
const TIME_VALUE = /(?<![\w.(-])(\d*\.?\d+)(ms|s)\b/g
/** 过渡、动画的时长，以及名字里带 duration 的自定义属性（组件自己的时长变量，如确认框的进出场） */
const MOTION_DURATION_DECL =
  /(?<![\w-])(transition|transition-duration|animation|animation-duration|--[\w-]*duration[\w-]*)\s*:\s*([^;{}]+)/g
const MOTION_EASING_LITERAL = /cubic-bezier\(\s*0?\.22\s*,\s*1\s*,\s*0?\.36\s*,\s*1\s*\)/

const splitTopLevel = value => {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(') depth++
    else if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  parts.push(current)
  return parts
}

function checkMotionTokens(rel, contexts) {
  if (rel === 'src/styles/tokens.css') return
  for (const context of contexts) {
    if (!isCssLike(context)) continue
    const lines = context.text.split('\n')
    for (const match of context.text.matchAll(MOTION_DURATION_DECL)) {
      const [, property, value] = match
      const lineNumber = lineAt(context.text, match.index)
      if (lines[lineNumber - 1]?.includes(ALLOW_MARKER)) continue
      const isCustomProperty = property.startsWith('--')
      // 自定义时长变量可能给动画用：与动画一样，400ms 以上的长动画不要求落在刻度上
      const isAnimation = property.startsWith('animation') || isCustomProperty
      const durations = splitTopLevel(value).flatMap(segment => {
        const times = [...segment.matchAll(TIME_VALUE)]
        return property.endsWith('-duration') || isCustomProperty ? times : times.slice(0, 1)
      })
      const offending = durations.find(time => {
        const ms = time[2] === 'ms' ? Number(time[1]) : Number(time[1]) * 1000
        if (ms <= 1) return false
        return !(isAnimation && ms >= 400)
      })
      if (offending) {
        report(
          rel,
          context.startLine + lineNumber - 1,
          'motion-duration-token',
          `时长 ${offending[0]} 写成了字面量：过渡与短动画用 var(--motion-duration-xs / sm / md / lg / xl / 2xl)`
        )
      }
    }
    eachLine(context, (line, lineNumber) => {
      if (MOTION_EASING_LITERAL.test(line)) {
        report(
          rel,
          lineNumber,
          'motion-easing-token',
          '这条缓动曲线就是 --motion-easing，写 var(--motion-easing)'
        )
      }
    })
  }
}

/*
 * 移动布局只有一个断点：宽度 < 768px（hooks/useViewport 的 isMobile、Tailwind 的 md: 前缀同一口径），
 * CSS 写 (max-width: 767.9px) 或 (min-width: 768px)；触控热区按 (pointer: coarse)，不按宽度。
 * 别的宽度（例如按内容疏密分档）在该行或紧挨着的上一行注释里写 design-guard-allow 并说明理由
 */
const WIDTH_QUERY = /\((max|min)-width\s*:\s*([\d.]+)px\)/g

/*
 * 全局 token（tokens.css、明暗主题与层级文件里声明的）总是有值，var(--x, 兜底) 的兜底值永远用不上，
 * 却会和 token 各走各的：曾有一半的兜底值与现行取值不一致（例如控件字号兜底 15px、实际 14px），读代码的人会被误导。
 * 组件内局部声明的变量（按元素设置、可能没有）照样可以写兜底
 */
const GLOBAL_TOKEN_FILES = [
  'src/styles/tokens.css',
  'src/styles/themes/light.css',
  'src/styles/themes/dark.css',
  Z_INDEX_SOURCE,
]
const VAR_WITH_FALLBACK = /var\(\s*(--[\w-]+)\s*,/g

function checkGlobalTokenFallbacks(fileContexts, sources) {
  const globalTokens = new Set(
    GLOBAL_TOKEN_FILES.flatMap(file => [...declaredCustomProperties(sources.get(file) || '')])
  )
  for (const { rel, contexts } of fileContexts) {
    for (const context of contexts) {
      eachMatch(context, VAR_WITH_FALLBACK, (match, line) => {
        if (!globalTokens.has(match[1])) return
        report(
          rel,
          line,
          'token-fallback',
          `${match[1]} 是全局 token，总是有值：写 var(${match[1]})，不写兜底值（兜底值会和 token 各走各的）`
        )
      })
    }
  }
}

/*
 * 主色阶（--primary-*、Tailwind 的 primary-*）只在明暗主题与 tokens.css 里派生语义色时用：
 * 页面与组件用 --accent、--text-link、--input-border-focus 这类语义 token（Tailwind 的 accent 颜色），
 * 语义里没有的就在主题 / tokens 里补一个，不在页面上直接挑色阶
 */
const ACCENT_SCALE_SOURCES = new Set([
  'src/styles/tokens.css',
  'src/styles/themes/light.css',
  'src/styles/themes/dark.css',
])
/** 取颜色的 Tailwind 工具类前缀：bg-primary、ring-offset-primary-500、!bg-primary-500 都算直接用主色阶 */
const COLOR_UTILITY_PREFIX =
  '(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)'
const RAW_PRIMARY = new RegExp(
  `(?:--primary-\\d{2,3}\\b|(?:^|[\\s'"\`:!])(?:${COLOR_UTILITY_PREFIX}-primary(?:-\\d{2,3})?|primary-\\d{2,3})(?:\\/\\d+)?(?=[\\s'"\`]|$))`
)

function checkAccentScale(rel, contexts) {
  if (ACCENT_SCALE_SOURCES.has(rel)) return
  for (const context of contexts) {
    eachLine(context, (line, lineNumber) => {
      if (RAW_PRIMARY.test(line)) {
        report(
          rel,
          lineNumber,
          'accent-token',
          '不直接用主色阶（primary-*）：用 --accent / accent 等语义色，缺的在主题或 tokens.css 里补一个语义 token'
        )
      }
    })
  }
}

/* 安全区只经 tokens.css 的 --safe-top / right / bottom / left 读，贴边的那一层用，里面的元素不再叠加 */
function checkSafeAreaTokens(rel, contexts) {
  if (rel === 'src/styles/tokens.css') return
  for (const context of contexts) {
    eachLine(context, (line, lineNumber) => {
      if (/env\(\s*safe-area-inset-/.test(line)) {
        report(
          rel,
          lineNumber,
          'safe-area-token',
          '安全区用 var(--safe-top / --safe-right / --safe-bottom / --safe-left)，只在贴着屏幕边缘的那一层让出'
        )
      }
    })
  }
}

/**
 * 紧挨着的上一段注释带豁免标记：多行注释去掉后只剩空白行，标记留在注释首行，所以往上跳过空白行找
 */
function allowedByPrecedingComment(lines, index) {
  for (let previous = index - 1; previous >= 0; previous--) {
    if (lines[previous].includes(ALLOW_MARKER)) return true
    if (lines[previous].trim()) return false
  }
  return false
}

function checkBreakpoints(rel, contexts) {
  for (const context of contexts) {
    if (!isCssLike(context)) continue
    const lines = context.text.split('\n')
    lines.forEach((line, index) => {
      if (!line.includes('@media') || line.includes(ALLOW_MARKER)) return
      if (allowedByPrecedingComment(lines, index)) return
      const lineNumber = context.startLine + index
      for (const [, bound, value] of line.matchAll(WIDTH_QUERY)) {
        const ok = (bound === 'max' && value === '767.9') || (bound === 'min' && value === '768')
        if (!ok) {
          report(
            rel,
            lineNumber,
            'single-breakpoint',
            `断点 ${bound}-width: ${value}px：移动布局只用 (max-width: 767.9px) / (min-width: 768px)，触控尺寸用 (pointer: coarse)`
          )
        }
      }
    })
  }
}

/*
 * Tailwind 不认识的类会被静默丢掉：曾有只读提示条写成 border-border-subtle bg-surface-elevated，
 * 两个类都不存在，暗色下只剩默认的亮灰边、没有底色。把模板 class / :class 里看起来像颜色、描边类工具类的写法
 * 用生产同款配置编译一遍，既没生成规则、也不是 styles/ 与组件里自定义的类，就报出来
 * （颜色键指向 CSS 变量，不支持 /80 这类透明度后缀，也会在这里报出）
 */
const CLASS_ATTRIBUTE = /(?:^|\s)(?::|v-bind:)?class\s*=\s*(["'])([\s\S]*?)\1/g
const COLOR_UTILITY_CANDIDATE =
  /^!?(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)-[a-z][a-z0-9-]*(?:\/\d{1,3})?$/
const CLASS_TOKEN_SPLIT = /[\s'"`{}()[\],;=<>?|&+]+/

const cssEscapeClass = name => name.replace(/[!/.:%#@]/g, char => `\\${char}`)

async function checkUnknownUtilities(fileContexts) {
  const customClasses = new Set()
  const occurrences = new Map()
  for (const { rel, contexts } of fileContexts) {
    for (const context of contexts) {
      if (isCssLike(context)) {
        for (const match of context.text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g))
          customClasses.add(match[1])
        continue
      }
      if (context.kind !== 'template') continue
      const lines = context.text.split('\n')
      for (const attribute of context.text.matchAll(CLASS_ATTRIBUTE)) {
        const lineNumber = lineAt(
          context.text,
          attribute.index + attribute[0].indexOf(attribute[2])
        )
        if (lines[lineNumber - 1]?.includes(ALLOW_MARKER)) continue
        for (const raw of attribute[2].split(CLASS_TOKEN_SPLIT)) {
          const token = raw.slice(raw.lastIndexOf(':') + 1)
          if (!COLOR_UTILITY_CANDIDATE.test(token)) continue
          const name = token.replace(/^!/, '')
          if (!occurrences.has(name)) occurrences.set(name, [])
          occurrences.get(name).push({ rel, line: context.startLine + lineNumber - 1 })
        }
      }
    }
  }
  const candidates = [...occurrences.keys()].filter(name => !customClasses.has(name))
  if (!candidates.length) return
  const require = createRequire(import.meta.url)
  const { css } = await postcss([
    tailwindcss({
      content: [{ raw: candidates.join(' '), extension: 'html' }],
      presets: [require(TAILWIND_CONFIG)],
    }),
  ]).process('@tailwind utilities;', { from: undefined })
  for (const name of candidates) {
    const selector = new RegExp(
      `\\.${cssEscapeClass(name).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}(?![\\w-])`
    )
    if (selector.test(css)) continue
    for (const { rel, line } of occurrences.get(name)) {
      report(
        rel,
        line,
        'unknown-utility',
        `「${name}」不是 Tailwind 能生成的类（颜色键见 tailwind.config.js，例如 border-app-border、bg-app-elevated），也不是自定义类`
      )
    }
  }
}

const PLAIN_CSS_MESSAGE =
  '样式只用 CSS（token、Tailwind 与 styles/ 下的语义 class），不引入 less / scss / stylus 预处理'

function checkPlainCss(rel, contexts) {
  for (const context of contexts) {
    if (context.kind === 'style' && PREPROCESSOR_LANG.test(context.attrs)) {
      report(rel, context.startLine, 'plain-css-only', PLAIN_CSS_MESSAGE)
    }
  }
}

/*
 * 组件样式的作用域：非 scoped 的 <style> 会把组件里的类名与覆盖带到全局（曾有组件改写 Tailwind 的
 * .hidden / .transform、把消息专属规则套到所有 .md-prose 上）。确需全局的规则放进 styles/，并用组件类名做前缀。
 */
function checkScopedStyles(rel, contexts) {
  for (const context of contexts) {
    if (context.kind === 'style' && context.sfcBlock && !/\bscoped\b/.test(context.attrs || '')) {
      report(
        rel,
        context.startLine,
        'scoped-component-styles',
        '组件样式写在 <style scoped> 里；确需全局的规则放进 styles/，并用组件类名做前缀'
      )
    }
  }
}

/*
 * :global(...) 后面再接选择器（含 :deep）会被 Vue 编译成只剩括号里那一段的全局规则：
 * :global(html.dark) :deep(.x) 实际产出 html.dark {…}，改掉整页而目标元素一条都不生效。
 * 要按祖先条件限定组件内元素，写成 html.dark .本组件容器 :deep(.x)。
 */
const GLOBAL_WITH_TRAILING_SELECTOR = /:global\([^()]*\)\s*(?=[^\s,{])/g

function checkGlobalSelectorMisuse(rel, contexts) {
  for (const context of contexts) {
    if (context.kind !== 'style' || !context.sfcBlock) continue
    eachMatch(context, GLOBAL_WITH_TRAILING_SELECTOR, (_match, line) =>
      report(
        rel,
        line,
        'no-global-with-trailing-selector',
        ':global(...) 后面不能再接选择器（会被编译成只剩括号里那一段的全局规则），改写成「祖先条件 + 组件容器 + :deep」'
      )
    )
  }
}

/* 不在自己的样式里重定义 Tailwind 工具类：改写后全站用到这个类的地方都会跟着变 */
const TAILWIND_UTILITY_NAMES = [
  'hidden',
  'block',
  'inline',
  'inline-block',
  'inline-flex',
  'flex',
  'grid',
  'inline-grid',
  'contents',
  'transform',
  'transition',
  'relative',
  'absolute',
  'fixed',
  'sticky',
  'static',
  'visible',
  'invisible',
  'truncate',
]
/**
 * 选择器里任何位置出现这些类都算：.hidden、.hidden:hover、&.hidden、.menu.hidden……
 * 「后面在遇到 ; 或 } 之前先遇到 {」保证匹配的是选择器而不是声明值；:not(.hidden) 只是排除条件，不算
 */
const UTILITY_REDEFINITION = new RegExp(
  `(?<!:not\\()\\.(${TAILWIND_UTILITY_NAMES.join('|')})(?![\\w-])(?=[^;{}]*\\{)`,
  'g'
)

function checkUtilityRedefinition(rel, contexts) {
  for (const context of contexts) {
    if (!isCssLike(context)) continue
    if (context.kind === 'style' && !context.sfcBlock) continue
    eachMatch(context, UTILITY_REDEFINITION, (match, line) =>
      report(
        rel,
        line,
        'no-utility-redefinition',
        `不要在样式里重定义 Tailwind 工具类 .${match[1]}：全站用到它的地方都会跟着变；换一个语义类名`
      )
    )
  }
}

/* ---------------------------------------------------------------- 跨文件规则 */

const CUSTOM_PROPERTY_DECL = /(--[a-zA-Z0-9-]+)\s*:/g

function declaredCustomProperties(text) {
  return new Set([...text.matchAll(CUSTOM_PROPERTY_DECL)].map(match => match[1]))
}

function checkThemeAliasOverride(sources) {
  const tokens = declaredCustomProperties(sources.get(PALETTE_FILES[0]) ?? '')
  for (const themeFile of PALETTE_FILES.slice(1)) {
    const text = sources.get(themeFile)
    if (!text) continue
    for (const match of text.matchAll(CUSTOM_PROPERTY_DECL)) {
      const name = match[1]
      if (!tokens.has(name) || THEME_OVERRIDE_ALLOW[name]) continue
      const line = lineAt(text, match.index)
      if ((text.split('\n')[line - 1] || '').includes('design-guard-allow')) continue
      report(
        themeFile,
        line,
        'theme-no-alias-override',
        `${name} 已在 tokens.css 定义为别名，主题文件只放调色板差异，不重定义组件 / 交互 / 动效别名`
      )
    }
  }
}

function checkUndefinedCssVars(fileContexts) {
  const defined = new Set()
  const references = new Map()
  for (const { rel, contexts } of fileContexts) {
    for (const context of contexts) {
      if (isCssLike(context) || context.kind === 'template') {
        for (const match of context.text.matchAll(CUSTOM_PROPERTY_DECL)) defined.add(match[1])
        // 模板 :style 对象里的 '--x': value 也是定义
        for (const match of context.text.matchAll(/['"`](--[a-zA-Z0-9-]+)['"`]\s*:/g))
          defined.add(match[1])
        for (const match of context.text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
          const name = match[1]
          if (!references.has(name)) {
            references.set(name, {
              rel,
              line: context.startLine + lineAt(context.text, match.index) - 1,
            })
          }
        }
      }
      if (context.kind === 'script') {
        for (const match of context.text.matchAll(/setProperty\(\s*[`'"](--[a-zA-Z0-9-]+)/g))
          defined.add(match[1])
        for (const match of context.text.matchAll(/['"`](--[a-zA-Z0-9-]+)['"`]\s*:/g))
          defined.add(match[1])
        // 模板字面量拼出的变量名（如 `--primary-${shade}`）按前缀放行
        for (const match of context.text.matchAll(/setProperty\(\s*`(--[a-zA-Z0-9-]+)\$\{/g))
          defined.add(`${match[1]}*`)
      }
    }
  }
  const prefixes = [...defined].filter(name => name.endsWith('*')).map(name => name.slice(0, -1))
  for (const [name, { rel, line }] of references) {
    if (
      defined.has(name) ||
      prefixes.some(prefix => name.startsWith(prefix)) ||
      UNDEFINED_VAR_ALLOW[name]
    )
      continue
    report(
      rel,
      line,
      'css-var-defined',
      `var(${name}) 在整个 src / tailwind.config.js 里没有定义，检查变量名或先在 tokens.css 登记`
    )
  }
}

/**
 * 轻量 CSS 块解析：返回每条声明及其选择器栈（嵌套 less 与 @media 一并记录）。
 * 只用于减弱动效覆盖检查，不追求完整 CSS 语法。
 */
function parseDeclarations(text) {
  const declarations = []
  const stack = []
  let buffer = ''
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '{') {
      stack.push(buffer.trim())
      buffer = ''
    } else if (char === '}') {
      flush()
      stack.pop()
    } else if (char === ';') {
      flush()
    } else {
      buffer += char
    }
    index++
  }
  function flush() {
    const colon = buffer.indexOf(':')
    if (colon > 0 && stack.length) {
      const property = buffer.slice(0, colon).trim()
      if (/^[a-z-]+$/i.test(property)) {
        declarations.push({
          property,
          value: buffer.slice(colon + 1).trim(),
          chain: [...stack],
          offset: index,
        })
      }
    }
    buffer = ''
  }
  return declarations
}

const classNames = selector =>
  [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(match => match[1])
const isReducedMotionMedia = prelude => /@media[^{]*prefers-reduced-motion/.test(prelude)

function transitionMovesLayout(value) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized === 'none' || normalized === '') return false
  return normalized
    .split(',')
    .map(part => part.trim().split(' ')[0])
    .some(property => MOTION_PROPERTIES.has(property))
}

function checkReducedMotionCoverage(fileContexts) {
  const covered = new Set()
  const rulesToCheck = []
  for (const { rel, contexts } of fileContexts) {
    for (const context of contexts) {
      if (!isCssLike(context)) continue
      for (const declaration of parseDeclarations(context.text)) {
        const inReducedMotion = declaration.chain.some(isReducedMotionMedia)
        const selectors = declaration.chain.filter(item => !item.startsWith('@'))
        const names = selectors.flatMap(classNames)
        if (inReducedMotion) {
          names.forEach(name => covered.add(name))
          continue
        }
        const moves =
          ((declaration.property === 'transition' ||
            declaration.property === 'transition-property') &&
            transitionMovesLayout(declaration.value)) ||
          ((declaration.property === 'animation' || declaration.property === 'animation-name') &&
            !/^\s*none\b/.test(declaration.value))
        if (!moves) continue
        const line = context.startLine + lineAt(context.text, declaration.offset) - 1
        rulesToCheck.push({
          rel,
          line,
          names,
          selector: selectors.join(' '),
          lineText: context.text.split('\n')[lineAt(context.text, declaration.offset) - 1] || '',
        })
      }
    }
  }
  for (const rule of rulesToCheck) {
    if (rule.lineText.includes('design-guard-allow')) continue
    if (rule.names.some(name => covered.has(name) || REDUCED_MOTION_GATED[name])) continue
    report(
      rule.rel,
      rule.line,
      'reduced-motion-coverage',
      `「${rule.selector}」有位移 / 尺寸 / 模糊类过渡或动画，但没有任何 @media (prefers-reduced-motion) 覆盖（reduce 关闭或 no-preference 才启用）`
    )
  }
}

/* ---------------------------------------------------------------- 主流程 */

function matchesExemption(rel, pattern) {
  if (!pattern.includes('*')) return rel.endsWith(pattern)
  const regex = new RegExp(
    `(?:^|/)${pattern
      .split('*')
      .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]+')}$`
  )
  return regex.test(rel)
}

function exemptRulesFor(rel) {
  const rules = new Set()
  for (const [pattern, exemption] of Object.entries(FILE_EXEMPTIONS)) {
    if (matchesExemption(rel, pattern)) exemption.rules.forEach(rule => rules.add(rule))
  }
  return rules
}

async function main() {
  const args = process.argv.slice(2).map(file => toRel(resolve(file)))
  const sources = new Map()
  const fileContexts = []
  for (const file of allFiles) {
    const rel = toRel(file)
    const source = readFileSync(file, 'utf8')
    sources.set(rel, source)
    fileContexts.push({ rel, contexts: contextsOf(file, source) })
  }

  for (const { rel, contexts } of fileContexts) {
    if (rel === 'tailwind.config.js' || rel.endsWith('.ts')) {
      checkSingleThemeMechanism(rel, contexts)
      checkAccentScale(rel, contexts)
      continue
    }
    checkBareColors(rel, contexts)
    checkPlainCss(rel, contexts)
    checkSingleThemeMechanism(rel, contexts)
    checkZIndex(rel, contexts)
    checkTypeScale(rel, contexts)
    checkRadiusScale(rel, contexts)
    checkTransitionAll(rel, contexts)
    checkMotionTokens(rel, contexts)
    checkBreakpoints(rel, contexts)
    checkSafeAreaTokens(rel, contexts)
    checkAccentScale(rel, contexts)
    checkUtilityRedefinition(rel, contexts)
    if (rel.endsWith('.vue')) {
      checkScopedStyles(rel, contexts)
      checkGlobalSelectorMisuse(rel, contexts)
      checkForegroundShades(rel, contexts)
      checkHoverSurfaceBackground(rel, contexts)
      checkUiButtonTags(rel, contexts)
      checkHiddenWithResponsiveDisplay(rel, contexts)
    }
  }
  for (const file of srcFiles.filter(file => PREPROCESSOR_FILE.test(file))) {
    report(toRel(file), 1, 'plain-css-only', PLAIN_CSS_MESSAGE)
  }
  checkThemeAliasOverride(sources)
  checkRecipeSingleSource(fileContexts, sources)
  checkLayeredClassLiterals(fileContexts)
  checkUndefinedCssVars(fileContexts)
  checkGlobalTokenFallbacks(fileContexts, sources)
  checkReducedMotionCoverage(fileContexts)
  await checkUnknownUtilities(fileContexts)

  const inScope = problem => (args.length ? args.includes(problem.file) : true)
  const visible = problems.filter(
    problem => inScope(problem) && !exemptRulesFor(problem.file).has(problem.rule)
  )

  // DESIGN_GUARD_SHOW_EXEMPT=1 时把被 FILE_EXEMPTIONS 压掉的现存违规一并打印（不影响退出码），便于清账
  if (process.env.DESIGN_GUARD_SHOW_EXEMPT) {
    const exempted = problems.filter(
      problem => inScope(problem) && exemptRulesFor(problem.file).has(problem.rule)
    )
    console.log(`已登记豁免的现存违规 ${exempted.length} 处：`)
    for (const problem of exempted.sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line
    )) {
      console.log(`  ${problem.file}:${problem.line}  [${problem.rule}] ${problem.message}`)
    }
  }

  if (!visible.length) {
    if (!args.length) console.log(`设计规约检查通过（${fileContexts.length} 个文件）`)
    return
  }

  console.error('\n设计规约检查未通过（web/scripts/check-design-guidelines.mjs）：\n')
  for (const problem of visible.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.error(`  ${problem.file}:${problem.line}  [${problem.rule}] ${problem.message}`)
  }
  console.error(
    `\n共 ${visible.length} 处。确属例外时在该行加 \`design-guard-allow\` 注释并说明理由，或在 FILE_EXEMPTIONS 登记。\n`
  )
  process.exit(1)
}

await main()
