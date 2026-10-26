import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

type TemplateNode = {
  type: number
  tag?: string
  props?: Array<{
    type: number
    name: string
    value?: { content?: string }
    arg?: { content?: string }
  }>
  children?: TemplateNode[]
}

function imgNodes(file: string) {
  const { descriptor } = parse(readFileSync(resolve(process.cwd(), file), 'utf8'), {
    filename: file,
  })
  const found: TemplateNode[] = []
  const walk = (node: TemplateNode) => {
    if (node.type === 1 && node.tag === 'img') found.push(node)
    node.children?.forEach(walk)
  }
  if (descriptor.template?.ast) walk(descriptor.template.ast as unknown as TemplateNode)
  return found
}

describe('工具产出的图片', () => {
  it('直接加载（不带 loading=lazy）：宽高自适应的图片加载前是 0×0，懒加载时 Chrome 在对话画布里不会去请求', () => {
    const images = imgNodes('src/views/chat/components/Message/Text/MediaOutput.vue')
    expect(images.length).toBeGreaterThan(0)
    for (const img of images) {
      const loading = (img.props || []).find(
        p =>
          (p.type === 6 && p.name === 'loading') || (p.type === 7 && p.arg?.content === 'loading')
      )
      expect(loading).toBeUndefined()
    }
  })
})
