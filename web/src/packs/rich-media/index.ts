import { definePack } from '@/core/packs/definePack'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'
import manifest from './pack.json'

/**
 * 富媒体渲染包（前端）：思维导图 / Mermaid 消息、HTML / Mermaid / MarkMap 预览、
 * 带 CodeMirror 的代码面板、PDF / Office 文件预览。
 *
 * 由构建期环境变量 `VITE_RICH_MEDIA_ENABLED` 控制：只有取值恰为 `false` 时关闭。
 * 关闭后这些重型依赖（mermaid、markmap、codemirror、pdfjs、mammoth、xlsx 等）不再进入构建产物，
 * 消息按普通文本渲染，代码面板退化为只读高亮，文件面板退化为下载入口。
 *
 * 判断必须写成对 import.meta.env 的字面量比较，构建器才能把关闭分支连同动态导入一起裁掉。
 */
export const RICH_MEDIA_ENABLED = import.meta.env.VITE_RICH_MEDIA_ENABLED !== 'false'

const HtmlRenderer = () => import('./renderers/HtmlRenderer.vue')

export default definePack({
  id: manifest.id,
  tier: 'system',
  enabled: RICH_MEDIA_ENABLED,
  locales: { 'zh-CN': zhCN, 'en-US': enUS },
  // mermaid 代码块的语法高亮：只声明，由内核的高亮模块注册
  highlightLanguages: {
    mermaid: () => ({
      name: 'mermaid',
      contains: [],
      keywords: {
        keyword: 'graph flowchart sequenceDiagram classDiagram stateDiagram gitGraph pie gantt',
        built_in: 'TD TB BT RL LR',
      },
      case_insensitive: true,
    }),
  },
  slots: RICH_MEDIA_ENABLED
    ? {
        'message.renderer': [
          {
            id: 'rich-media.mind-map',
            key: 'mind-map',
            component: () => import('./MindMap/index.vue'),
          },
          {
            id: 'rich-media.mermaid',
            key: 'mermaid',
            component: () => import('./Mermaid/index.vue'),
          },
        ],
        'preview.renderer': [
          { id: 'rich-media.html', key: 'html', component: HtmlRenderer },
          { id: 'rich-media.svg', key: 'svg', component: HtmlRenderer },
          {
            id: 'rich-media.mermaid-preview',
            key: 'mermaid',
            component: () => import('./renderers/MermaidRenderer.vue'),
          },
          {
            id: 'rich-media.markmap-preview',
            key: 'markmap',
            component: () => import('./renderers/MarkMapRenderer.vue'),
          },
        ],
        'side.panel': [
          {
            id: 'rich-media.code-panel',
            key: 'code',
            component: () => import('./panels/CodePanel.vue'),
          },
          {
            id: 'rich-media.file-panel',
            key: 'file',
            component: () => import('./panels/FilePreviewPanel.vue'),
          },
        ],
      }
    : undefined,
})
