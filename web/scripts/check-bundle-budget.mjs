#!/usr/bin/env node
/**
 * 首屏体积预算：生产构建之后量入口组（index.html 的入口及其静态依赖）与首个聊天画面
 * （入口组加上会话页分块及其静态依赖）的 gzip 体积，以及入口样式，超出 scripts/bundle-budget.json 就失败。
 * 防止首屏体积悄悄回退（按需加载的库被静态引入、大库挤进首屏）。
 *
 * 用法（在 web/ 目录下，先 pnpm build-only）：
 *   pnpm check:bundle            检查
 *   pnpm check:bundle --write    按当前体积加 5% 余量重设预算（有意扩容时用，并在提交说明写明原因）
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(WEB_ROOT, 'dist')
const BUDGET_FILE = join(WEB_ROOT, 'scripts', 'bundle-budget.json')
const HEADROOM = 1.05

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('没有找到 dist/index.html：先运行 pnpm build-only')
  process.exit(1)
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const assetsDir = join(DIST, 'assets')
const jsFiles = readdirSync(assetsDir).filter(file => file.endsWith('.js'))
const gzipKB = buffer => gzipSync(buffer, { level: 9 }).length / 1024

/** 一个分块静态引入的分块（动态 import 不算：它们不在首屏） */
function staticImportsOf(file) {
  const code = readFileSync(join(assetsDir, file), 'utf8')
  const found = new Set()
  for (const match of code.matchAll(
    /(?:^|[;}\s])import\s*(?:[\w${},*\s]+from\s*)?["']\.\/([\w.$-]+\.js)["']/g
  )) {
    found.add(match[1])
  }
  for (const match of code.matchAll(/from\s*["']\.\/([\w.$-]+\.js)["']/g)) found.add(match[1])
  return [...found]
}

function closure(roots) {
  const seen = new Set()
  const stack = [...roots]
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    stack.push(...staticImportsOf(file))
  }
  return seen
}

const sizeKB = files =>
  [...files].reduce((sum, file) => sum + gzipKB(readFileSync(join(assetsDir, file))), 0)

const entryFiles = [...html.matchAll(/<script[^>]+src="[^"]*assets\/([\w.$-]+\.js)"/g)].map(
  m => m[1]
)
const entryGroup = closure(entryFiles)
const chatChunk = jsFiles.find(file => /^chat-[\w-]+\.js$/.test(file))
if (!entryFiles.length || !chatChunk) {
  console.error('没有找到入口脚本或会话页分块（chat-*.js）：构建产物结构变了，需要同步更新本脚本')
  process.exit(1)
}
const firstChatScreen = new Set([...entryGroup, ...closure([chatChunk])])
const entryCss = [
  ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="[^"]*css\/([\w.$-]+\.css)"/g),
].map(m => m[1])
const entryCssKB = entryCss.reduce(
  (sum, file) => sum + gzipKB(readFileSync(join(DIST, 'css', file))),
  0
)

const measured = {
  entryJsGzipKB: sizeKB(entryGroup),
  firstChatScreenJsGzipKB: sizeKB(firstChatScreen),
  entryCssGzipKB: entryCssKB,
}

const round = value => Math.round(value * 10) / 10

if (process.argv.includes('--write')) {
  const budget = Object.fromEntries(
    Object.entries(measured).map(([key, value]) => [key, round(value * HEADROOM)])
  )
  writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`)
  console.log('已按当前体积加 5% 余量重设首屏体积预算：', budget)
  process.exit(0)
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'))
const labels = {
  entryJsGzipKB: '入口组 JS（gzip）',
  firstChatScreenJsGzipKB: '首个聊天画面 JS（gzip）',
  entryCssGzipKB: '入口样式（gzip）',
}
let failed = false
for (const [key, value] of Object.entries(measured)) {
  const limit = budget[key]
  const over = typeof limit === 'number' && value > limit
  if (over) failed = true
  console.log(`${over ? '超出' : '通过'}  ${labels[key]}：${round(value)} KB / 预算 ${limit} KB`)
}
if (failed) {
  console.error(
    '\n首屏体积超出预算：检查是否把按需加载的库静态引入了首屏；确属有意扩容时用 --write 重设并在提交说明写明原因。'
  )
  process.exit(1)
}
