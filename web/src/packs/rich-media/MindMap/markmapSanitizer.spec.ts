// @vitest-environment jsdom
// markmap 净化依赖标准 DOM 解析行为（表格/MathML/SVG 命名空间），
// happy-dom 在这些场景与浏览器有差异，故本文件固定用 jsdom。
import { describe, expect, it } from 'vitest'
import { sanitizeMarkmapContent, sanitizeMarkmapTree } from './index.vue'

/**
 * markmap 节点内容会经 markmap-view 的 innerHTML 注入 SVG foreignObject，
 * 且不在 iframe sandbox 内，是模型可控内容直达第一方源的唯一路径。
 * 这里同时锁住两个方向：攻击载荷必须清零，正常表达能力必须保留。
 */

const parse = (html: string) => {
  const holder = document.createElement('div')
  holder.innerHTML = html
  return holder
}

const ATTACKS = [
  '<img src=x onerror=alert(1)>',
  '<IMG SRC=x ONERROR=alert(1)>',
  '<span onclick=alert(1)>c</span>',
  '<script>alert(1)</script>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="  JaVaScRiPt:alert(1)">x</a>',
  '<a href="vbscript:alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<a href="data:image/svg+xml,<svg onload=alert(1)>">x</a>',
  '<img src="javascript:alert(1)">',
  '<img src="data:text/html,<script>alert(1)</script>">',
  '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)">',
  '<form action="javascript:alert(1)"><input formaction="javascript:alert(1)"></form>',
  '<svg><animate onbegin=alert(1) attributeName=x dur=1s></svg>',
  '<svg onload=alert(1)><path d="M0 0"/></svg>',
  '<svg><foreignObject><body onload=alert(1)></body></foreignObject></svg>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<math><mtext><mglyph><style><!--</style><img src=x onerror=alert(1)>',
  '<style>@import "javascript:alert(1)";</style>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<span style="width:expression(alert(1))">x</span>',
  '<span style="colo/*x*/r:red">x</span>',
  '<base href="javascript:alert(1)//">',
  '<link rel=stylesheet href="javascript:alert(1)">',
  '<template><img src=x onerror=alert(1)></template>',
]

const DANGEROUS_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'STYLE',
  'LINK',
  'META',
  'BASE',
  'TEMPLATE',
  'MGLYPH',
  'ANNOTATION-XML',
  'ANIMATE',
  'SET',
  'USE',
  'FOREIGNOBJECT',
  'MARQUEE',
])

describe('sanitizeMarkmapContent - 攻击载荷', () => {
  it.each(ATTACKS)('清除: %s', payload => {
    const out = sanitizeMarkmapContent(payload)

    // 1) 不出现危险标签
    parse(out)
      .querySelectorAll('*')
      .forEach(node => {
        expect(DANGEROUS_TAGS.has(node.tagName.toUpperCase())).toBe(false)
      })

    // 2) 不出现事件属性
    parse(out)
      .querySelectorAll('*')
      .forEach(node => {
        Array.from(node.attributes).forEach(attr => {
          expect(attr.name.toLowerCase().startsWith('on')).toBe(false)
        })
      })

    // 3) 不出现危险协议与 CSS 注入
    expect(/javascript:|vbscript:|data:text\/html|data:image\/svg/i.test(out)).toBe(false)
    expect(/expression\(|@import|url\(\s*javascript/i.test(out)).toBe(false)
  })

  it('外链被强制 noopener，且不保留 opener 语义', () => {
    const out = sanitizeMarkmapContent(
      '<a href="https://a.com" target="framename" rel="opener">x</a>'
    )
    const link = parse(out).querySelector('a')!

    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('style 只保留排版属性，覆盖层相关属性被剥离', () => {
    const out = sanitizeMarkmapContent(
      '<span style="position:fixed;z-index:99;top:0;height:1em">x</span>'
    )

    expect(out).not.toMatch(/position|z-index/i)
    expect(out).toMatch(/top|height/i)
  })
})

describe('sanitizeMarkmapContent - 正常表达能力', () => {
  it('保留链接文本与安全地址', () => {
    const out = sanitizeMarkmapContent('<a href="https://example.com/a?b=1#c">官网</a>')
    const link = parse(out).querySelector('a')!

    expect(link.getAttribute('href')).toBe('https://example.com/a?b=1#c')
    expect(link.textContent).toBe('官网')
  })

  it('保留表格表头（thead/th 属于 DOMPurify 默认删内容名单，最易回归）', () => {
    const out = sanitizeMarkmapContent(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
    )
    const holder = parse(out)

    expect(Array.from(holder.querySelectorAll('th')).map(n => n.textContent)).toEqual(['A', 'B'])
    expect(Array.from(holder.querySelectorAll('td')).map(n => n.textContent)).toEqual(['1', '2'])
  })

  it('保留代码块换行（pre 被剥掉会让多行代码塌成一行）', () => {
    const out = sanitizeMarkmapContent('<pre><code>line1\nline2</code></pre>')

    expect(parse(out).querySelector('pre')).not.toBeNull()
    expect(parse(out).textContent).toContain('\n')
  })

  it('保留 KaTeX 可视分支所需的 class 与内联 style（剥掉会渲染出错误内容）', () => {
    const out = sanitizeMarkmapContent(
      '<span class="mfrac"><span class="frac-line" style="border-bottom-width:0.04em"></span></span>'
    )

    expect(out).toContain('class="mfrac"')
    expect(out).toMatch(/border-bottom-width/)
  })

  it('保留 MathML 结构与顺序', () => {
    const out = sanitizeMarkmapContent(
      '<math><semantics><mfrac><mi>a</mi><mi>b</mi></mfrac><annotation>\\frac{a}{b}</annotation></semantics></math>'
    )
    const holder = parse(out)

    expect(Array.from(holder.querySelectorAll('mi')).map(n => n.textContent)).toEqual(['a', 'b'])
    expect(holder.querySelector('annotation')?.textContent).toBe('\\frac{a}{b}')
  })

  it('保留行内格式与图片', () => {
    const out = sanitizeMarkmapContent(
      '<strong>粗</strong><em>斜</em><code>c</code><br><img src="https://a.com/x.png" alt="图">'
    )
    const holder = parse(out)

    expect(holder.querySelector('strong')?.textContent).toBe('粗')
    expect(holder.querySelector('img')?.getAttribute('src')).toBe('https://a.com/x.png')
  })
})

describe('sanitizeMarkmapTree', () => {
  it('递归净化整棵树，非字符串 content 归一为空串', () => {
    const root: any = {
      content: '<img src=x onerror=alert(1)>根',
      children: [
        { content: '<script>alert(1)</script>子', children: [] },
        { content: 123 as any, children: [] },
      ],
    }

    const out: any = sanitizeMarkmapTree(root)

    expect(out.content).not.toMatch(/onerror/)
    expect(out.content).toContain('根')
    expect(out.children[0].content).not.toMatch(/<script/)
    expect(out.children[1].content).toBe('')
  })

  it('超深树按深度上限截断且不栈溢出', () => {
    const root: any = { content: 'r', children: [] }
    let cursor = root
    for (let i = 0; i < 900; i += 1) {
      const child: any = { content: `n${i}`, children: [] }
      cursor.children = [child]
      cursor = child
    }

    expect(() => sanitizeMarkmapTree(root)).not.toThrow()
  })
})
