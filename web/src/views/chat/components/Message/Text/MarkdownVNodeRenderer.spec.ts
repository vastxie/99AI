import { mount } from '@vue/test-utils'
import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { loadKatex } from '@/utils/markdown/katex'
import MarkdownVNodeRenderer from './MarkdownVNodeRenderer.vue'
import { getAssistantMarkdownSource, getStreamingMarkdownSource } from './markdownSource.helpers'
import { messageMarkdown } from './messageMarkdown'

const md = new MarkdownIt({ html: false, linkify: true })

const DOCUMENT = [
  '# 标题',
  '',
  '第一段，包含 **加粗** 和 `code`。',
  '',
  '- 列表一',
  '- 列表二',
  '',
  '```ts',
  'const a = 1',
  '```',
  '',
  '| 表头 | 值 |',
  '| --- | --- |',
  '| a | 1 |',
  '',
  '> 引用',
  '',
  '收尾段落。',
].join('\n')

const CodeBlockStub = {
  props: ['code', 'language', 'streaming'],
  template: '<pre :data-lang="language">{{ code }}</pre>',
}

function mountHost(initialSource: string, initialStreaming: boolean) {
  const source = ref(initialSource)
  const streaming = ref(initialStreaming)
  const Host = defineComponent({
    render: () =>
      h('div', { class: 'host' }, [
        h(MarkdownVNodeRenderer, {
          source: source.value,
          markdown: md,
          streaming: streaming.value,
        }),
      ]),
  })
  const wrapper = mount(Host, { global: { stubs: { CodeBlock: CodeBlockStub } } })
  return { wrapper, source, streaming }
}

function settledHtml(text: string) {
  const { wrapper } = mountHost(text, false)
  const html = wrapper.get('.host').html()
  wrapper.unmount()
  return html
}

function streamPrefixes(text: string, step: number) {
  const prefixes: string[] = []
  for (let length = step; length < text.length; length += step) prefixes.push(text.slice(0, length))
  prefixes.push(text)
  return prefixes
}

describe('MarkdownVNodeRenderer 流式增量渲染', () => {
  it('任意切块的流式 DOM 与同一前缀的一次性渲染一致，完成后与完整渲染一致', async () => {
    for (const step of [3, 7, 16]) {
      const { wrapper, source, streaming } = mountHost('', true)
      for (const prefix of streamPrefixes(DOCUMENT, step)) {
        source.value = prefix
        await nextTick()
        const { wrapper: fresh } = mountHost(prefix, true)
        expect(wrapper.get('.host').html()).toBe(fresh.get('.host').html())
        fresh.unmount()
      }
      streaming.value = false
      await nextTick()
      expect(wrapper.get('.host').html()).toBe(settledHtml(DOCUMENT))
      wrapper.unmount()
    }
  })

  it('已冻结块的 DOM 节点在后续增量与完成态都保持身份', async () => {
    const { wrapper, source, streaming } = mountHost('', true)
    const host = wrapper.get('.host').element
    const blocks = DOCUMENT.split('\n\n')

    // 前四块到齐：标题与第一段已越过不稳定尾部，成为冻结块
    source.value = blocks.slice(0, 4).join('\n\n')
    await nextTick()
    const heading = host.children[0]
    const paragraph = host.children[1]
    expect(heading.tagName).toBe('H1')
    expect(paragraph.tagName).toBe('P')
    const headingHtml = heading.outerHTML
    const paragraphHtml = paragraph.outerHTML

    for (let count = 5; count <= blocks.length; count += 1) {
      source.value = blocks.slice(0, count).join('\n\n')
      await nextTick()
      expect(host.children[0]).toBe(heading)
      expect(host.children[1]).toBe(paragraph)
    }
    expect(heading.outerHTML).toBe(headingHtml)
    expect(paragraph.outerHTML).toBe(paragraphHtml)

    // 完成态做完整解析：同一套按块 key，正文原地 patch 而不重挂载
    const tail = host.children[host.children.length - 1]
    streaming.value = false
    await nextTick()
    expect(host.children[0]).toBe(heading)
    expect(host.children[1]).toBe(paragraph)
    expect(host.children[host.children.length - 1]).toBe(tail)
    wrapper.unmount()
  })

  it('冻结的围栏块保持身份，缓存命中后代码块编号仍连续', async () => {
    const blocks = [
      '第一段',
      '```ts\nconst a = 1\n```',
      '第二段',
      '```js\nlet b = 2\n```',
      '第三段',
      '第四段',
      '第五段',
    ]
    const source = ref(blocks.slice(0, 4).join('\n\n'))
    const streaming = ref(true)
    const Host = defineComponent({
      render: () =>
        h('div', { class: 'host' }, [
          h(MarkdownVNodeRenderer, {
            source: source.value,
            markdown: md,
            streaming: streaming.value,
            stateScope: 's',
          }),
        ]),
    })
    const wrapper = mount(Host, {
      global: {
        stubs: {
          CodeBlock: {
            props: ['code', 'language', 'streaming', 'stateKey'],
            template: '<pre :data-state-key="stateKey">{{ code }}</pre>',
          },
        },
      },
    })
    await nextTick()
    const host = wrapper.get('.host').element
    const firstFence = host.children[1]
    expect(firstFence.tagName).toBe('PRE')
    expect(firstFence.getAttribute('data-state-key')).toBe('s:code-block-0')

    for (let count = 5; count <= blocks.length; count += 1) {
      source.value = blocks.slice(0, count).join('\n\n')
      await nextTick()
      expect(host.children[1]).toBe(firstFence)
      expect(
        Array.from(host.querySelectorAll('pre')).map(node => node.getAttribute('data-state-key'))
      ).toEqual(['s:code-block-0', 's:code-block-1'])
    }

    streaming.value = false
    await nextTick()
    expect(host.children[1]).toBe(firstFence)
    expect(
      Array.from(host.querySelectorAll('pre')).map(node => node.getAttribute('data-state-key'))
    ).toEqual(['s:code-block-0', 's:code-block-1'])
    wrapper.unmount()
  })

  it('非追加的源码变化会丢弃缓存并重新渲染', async () => {
    const { wrapper, source } = mountHost('段落一\n\n段落二\n\n段落三\n\n段落四', true)
    await nextTick()
    source.value = '完全不同\n\n的内容'
    await nextTick()
    expect(wrapper.get('.host').html()).toBe(
      (() => {
        const { wrapper: fresh } = mountHost('完全不同\n\n的内容', true)
        const html = fresh.get('.host').html()
        fresh.unmount()
        return html
      })()
    )
    wrapper.unmount()
  })
})

describe('回复正文里的图片', () => {
  it('直接加载（不带 loading=lazy）：加载前 0×0 的懒加载图片在对话画布里不会被请求', () => {
    const { wrapper } = mountHost('看图：\n\n![趋势图](https://example.com/chart.png)', false)
    const img = wrapper.get('img.chat-markdown-image')
    expect(img.attributes('src')).toBe('https://example.com/chart.png')
    expect(img.attributes('loading')).toBeUndefined()
    expect(img.attributes('decoding')).toBe('async')
    wrapper.unmount()
  })
})

describe('回复正文里的显示公式 \\[ … \\]', () => {
  const MATH_DOCUMENT = [
    '前文',
    '',
    '公式 \\[a^2 + b^2 = c^2\\] 结束',
    '',
    '- 列表里 \\[x\\]',
    '',
    '> 引用里 \\[\\frac{1}{2}\\]',
    '',
    '后文 $y$ 与 \\(z\\)',
  ].join('\n')

  async function mountMath(initialSource: string, initialStreaming: boolean) {
    const source = ref(initialSource)
    const streaming = ref(initialStreaming)
    const Host = defineComponent({
      render: () =>
        h('div', { class: 'host' }, [
          h(MarkdownVNodeRenderer, {
            source: source.value,
            markdown: messageMarkdown,
            streaming: streaming.value,
          }),
        ]),
    })
    const wrapper = mount(Host, { global: { stubs: { CodeBlock: CodeBlockStub } } })
    return { wrapper, source, streaming }
  }

  // 必须排在本组第一个：KaTeX 是模块级按需加载，之后的用例都已加载
  it('KaTeX 还没加载时冻结块先显示 TeX 源码，加载完成后原地换成排版结果，段落节点不变', async () => {
    const blocks = ['第一段 \\[x^2\\]', '第二段', '第三段', '第四段', '第五段']
    const { wrapper, source } = await mountMath('', true)
    source.value = getStreamingMarkdownSource(blocks.join('\n\n'))
    await nextTick()
    const host = wrapper.get('.host').element
    const paragraph = host.children[0]
    expect(paragraph.querySelector('.katex-pending')?.textContent).toBe('x^2')
    expect(paragraph.querySelector('.katex-display')).toBeNull()
    await loadKatex()
    await nextTick()
    expect(host.children[0]).toBe(paragraph)
    expect(paragraph.querySelector('.katex-display')).not.toBeNull()
    expect(paragraph.querySelector('.katex-pending')).toBeNull()
    wrapper.unmount()
  })

  it('在段落、列表项、引用里按显示模式排版，留在原容器，不吞后文', async () => {
    await loadKatex()
    const { wrapper } = await mountMath(getAssistantMarkdownSource(MATH_DOCUMENT), false)
    const host = wrapper.get('.host')
    expect(host.findAll('.katex-display')).toHaveLength(3)
    expect(host.find('p:nth-of-type(2) .katex-display').exists()).toBe(true)
    expect(host.find('li .katex-display').exists()).toBe(true)
    expect(host.find('blockquote .katex-display').exists()).toBe(true)
    expect(host.text()).toContain('后文')
    expect(host.findAll('.katex').length).toBeGreaterThanOrEqual(5)
    wrapper.unmount()
  })

  it('流式：任意前缀的增量渲染与一次性渲染一致，未闭合时没有公式，完成后与完整渲染一致', async () => {
    await loadKatex()
    for (const step of [2, 5, 11]) {
      const { wrapper, source, streaming } = await mountMath('', true)
      for (const prefix of streamPrefixes(MATH_DOCUMENT, step)) {
        source.value = getStreamingMarkdownSource(prefix)
        await nextTick()
        const { wrapper: fresh } = await mountMath(getStreamingMarkdownSource(prefix), true)
        expect(wrapper.get('.host').html(), prefix).toBe(fresh.get('.host').html())
        fresh.unmount()
      }
      streaming.value = false
      source.value = getAssistantMarkdownSource(MATH_DOCUMENT)
      await nextTick()
      const { wrapper: settled } = await mountMath(getAssistantMarkdownSource(MATH_DOCUMENT), false)
      expect(wrapper.get('.host').html()).toBe(settled.get('.host').html())
      settled.unmount()
      wrapper.unmount()
    }
    const { wrapper } = await mountMath(getStreamingMarkdownSource('公式 \\[a^2 + b'), true)
    expect(wrapper.find('.katex').exists()).toBe(false)
    expect(wrapper.get('.host').text()).toContain('[a^2 + b')
    wrapper.unmount()
  })
})
