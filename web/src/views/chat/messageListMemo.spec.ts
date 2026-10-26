import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import * as Vue from 'vue'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { afterEach, describe, expect, it } from 'vitest'
import { chatMessageKey } from './chatBase.helpers'

const srcRoot = resolve(process.cwd(), 'src')

type TemplateNode = {
  type: number
  tag?: string
  loc: { source: string }
  props?: Array<{
    type: number
    name: string
    arg?: { content?: string }
    exp?: { content?: string }
  }>
  children?: TemplateNode[]
}

function templateAst(file: string) {
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
  return descriptor.template?.ast as TemplateNode | undefined
}

/** 模板里同时带 v-for 与 v-memo 的元素 */
function memoLoops(root: TemplateNode | undefined) {
  const found: TemplateNode[] = []
  const walk = (node: TemplateNode) => {
    const names = (node.props || []).filter(p => p.type === 7).map(p => p.name)
    if (names.includes('for') && names.includes('memo')) found.push(node)
    node.children?.forEach(walk)
  }
  if (root) walk(root)
  return found
}

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : vueFiles(full)
    return entry.name.endsWith('.vue') ? [full] : []
  })
}

let host: HTMLElement | null = null
afterEach(() => {
  host?.remove()
  host = null
})

describe('对话消息列表（v-for + v-memo）', () => {
  it('打开有消息的对话能渲染出每条消息，更新其中一条也不出错', async () => {
    const [list] = memoLoops(templateAst(resolve(srcRoot, 'views/chat/chatBase.vue')))
    expect(list).toBeTruthy()
    const { code, errors } = compileTemplate({
      source: `<div>${list.loc.source}</div>`,
      filename: 'message-list.vue',
      id: 'message-list',
      compilerOptions: { mode: 'function', prefixIdentifiers: true },
    })
    expect(errors).toEqual([])
    const render = new Function('Vue', code)(Vue)

    const chatMessages = Vue.ref([
      { cid: 'c_user', role: 'user', content: '帮我分析销售数据' },
      { cid: 'c_reply', role: 'assistant', content: '好的' },
    ] as Array<Record<string, unknown>>)
    const app = Vue.createApp({
      setup: () => ({
        chatMessages,
        activeWorkspaceId: 'g_test',
        highlightedCid: null,
        isUserMessageEntering: () => false,
        handleMessageEntranceEnd: () => {},
        turns: { confirmDeleteMessage: () => {} },
        chatMessageKey,
      }),
      render,
    })
    app.component('Message', { render: () => Vue.h('span', { class: 'stub-message' }) })
    host = document.createElement('div')
    document.body.appendChild(host)
    app.mount(host)

    const cids = () =>
      [...host!.querySelectorAll('[data-chat-message-cid]')].map(el =>
        el.getAttribute('data-chat-message-cid')
      )
    expect(cids()).toEqual(['c_user', 'c_reply'])

    chatMessages.value = [
      chatMessages.value[0],
      { ...chatMessages.value[1], content: '好的，这是分析结果' },
    ]
    await Vue.nextTick()
    expect(cids()).toEqual(['c_user', 'c_reply'])
    app.unmount()
  })

  it('所有同时带 v-for 与 v-memo 的元素，:key 都是属性路径或函数调用（编译出的缓存判断不给 key 加括号）', () => {
    const offenders: string[] = []
    for (const file of vueFiles(srcRoot)) {
      for (const node of memoLoops(templateAst(file))) {
        const key = (node.props || []).find(
          p => p.type === 7 && p.name === 'bind' && p.arg?.content === 'key'
        )
        const exp = key?.exp?.content?.trim() || ''
        if (!/^[\w$.]+(\([^()]*\))?$/.test(exp))
          offenders.push(`${relative(srcRoot, file)}: :key="${exp}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})
