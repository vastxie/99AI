import { describe, expect, it, vi } from 'vitest'

// activityTimeline 仅消费 t 产出文案，stub 掉避免加载全量 locale JSON 与 i18n 实例
vi.mock('@/locales', () => ({
  t: (key: string, named?: Record<string, unknown>) =>
    named ? `${key}|${JSON.stringify(named)}` : key,
  tp: (key: string, count: number, named?: Record<string, unknown>) =>
    `${key}|${JSON.stringify({ count, ...named })}`,
}))

import type { Round, ToolCall } from '@/types/chat'
import {
  buildActivityEvents,
  buildMessageActivity,
  classifyToolOutput,
  getMessageFinalFileOutputs,
  hasFinalFileOutput,
  isFileSearchActivityDescriptor,
  isWebSearchActivityDescriptor,
  sanitizeToolInput,
} from './activityTimeline'
import { getActivityIconKey } from '../../activityIcons'

function makeToolCall(partial: Partial<ToolCall>): ToolCall {
  return { id: 'tool-1', name: 'tool', status: 'success', ...partial } as ToolCall
}

function makeRound(partial: Partial<Round>): Round {
  return { text: '', toolCalls: [], ...partial } as unknown as Round
}

it('累计产物在跨工具、快照重建和部分失败时只展示一份', () => {
  const a = { fileId: 'file_aaaaaaaaaaaaaaaaaaaaaaaa', name: 'a.txt', role: 'final' }
  const b = { fileId: 'file_bbbbbbbbbbbbbbbbbbbbbbbb', name: 'b.txt', role: 'final' }
  const rounds = [
    makeRound({
      toolCalls: [
        makeToolCall({ id: 'call_1', output: { files: [a] } }),
        makeToolCall({ id: 'call_2', status: 'error', output: { files: [a, b] } }),
      ],
    }),
  ]
  for (const snapshot of [rounds, JSON.parse(JSON.stringify(rounds))]) {
    const files = getMessageFinalFileOutputs(snapshot).flatMap(output => output.files || [])
    expect(files.map(file => file.fileId)).toEqual([a.fileId, b.fileId])
  }
})

describe('sanitizeToolInput', () => {
  it('保留白名单字段并拼接摘要（正例）', () => {
    const result = sanitizeToolInput({ query: 'hello world', location: 'shanghai' })
    expect(result).toContain('query: hello world')
    expect(result).toContain('location: shanghai')
  })

  it('敏感字段值不进入摘要（反例）', () => {
    expect(sanitizeToolInput({ apiKey: 'sk-secret-123', token: 'tok-456' })).toBeUndefined()

    const mixed = sanitizeToolInput({ query: 'hi', password: 'p@ss', authorization: 'Bearer x' })
    expect(mixed).toContain('query: hi')
    expect(mixed).not.toContain('p@ss')
    expect(mixed).not.toContain('Bearer x')
  })

  it('字符串中的带签名 URL 被压缩为主机/文件名（防泄露）', () => {
    const result = sanitizeToolInput(
      'download https://bucket.s3.example.com/exports/report.pdf?X-Amz-Signature=secretsig'
    )
    expect(result).toContain('bucket.s3.example.com/report.pdf')
    expect(result).not.toContain('X-Amz-Signature')
    expect(result).not.toContain('secretsig')
  })

  it('空入参返回 undefined（边界）', () => {
    expect(sanitizeToolInput(undefined)).toBeUndefined()
    expect(sanitizeToolInput(null)).toBeUndefined()
    expect(sanitizeToolInput('')).toBeUndefined()
  })
})

describe('classifyToolOutput', () => {
  it('当前摘要优先于额外的未知字段', () => {
    const result = classifyToolOutput({
      result: { content: '给用户看的正文' },
      summary: '内部摘要',
      content: '不应被当作摘要的兜底内容',
    })
    expect(result.activitySummary).toBe('内部摘要')
  })

  it('无显式用户内容时 content 兜底为活动摘要（正例）', () => {
    const result = classifyToolOutput({ content: '兜底内容' })
    expect(result.activitySummary).toBe('兜底内容')
  })

  it('files 字段过滤掉无 url / fileId / 预览内容的脏数据（反例）', () => {
    const result = classifyToolOutput({
      files: [
        { url: 'https://h/a.png' },
        { fileId: 'file_ok1' },
        { name: 'no-target.png' },
        {},
        null,
      ],
    })
    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0].field).toBe('files')
    expect(result.outputs[0].items).toHaveLength(2)
  })

  it('空输出返回全空结构（边界）', () => {
    expect(classifyToolOutput(null)).toEqual({
      activitySummary: null,
      previewContent: null,
      outputs: [],
    })
  })
})

describe('hasFinalFileOutput', () => {
  it('携带文件产物时为 true（正例）', () => {
    expect(makeAndCheck({ files: [{ url: 'https://h/report.pdf' }] })).toBe(true)
    expect(makeAndCheck({ filePreview: { previewContent: '# md', title: 'doc.md' } })).toBe(true)
  })

  it('无文件产物时为 false（反例）', () => {
    expect(makeAndCheck(undefined)).toBe(false)
    expect(makeAndCheck({})).toBe(false)
    expect(makeAndCheck({ content: '纯文本输出' })).toBe(false)
  })

  function makeAndCheck(output: unknown): boolean {
    return hasFinalFileOutput(makeToolCall({ output: output as ToolCall['output'] }))
  }
})

describe('buildActivityEvents', () => {
  it('思考与工具调用映射为事件（正例）', () => {
    const round = makeRound({
      thinking: '推理过程',
      toolCalls: [makeToolCall({ name: '联网搜索', output: { summary: '找到 3 条结果' } })],
    })
    const events = buildActivityEvents(round, { roundIndex: 0 })

    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('thinking')
    expect(events[0].content).toBe('推理过程')
    expect(events[1].title).toBe('activity.webSearch')
    expect(events[1].status).toBe('success')
    expect(events[1].summary).toBe('找到 3 条结果')
  })

  it('原生搜索事件优先展示查询词与来源数量（正例）', () => {
    const round = makeRound({
      toolCalls: [
        makeToolCall({
          name: 'openai_web_search',
          type: 'search',
          display: {
            summary: '正在搜索公开网页',
            json: {
              queries: ['GPT-5.6 最新动态'],
              sources: [
                { title: 'OpenAI', url: 'https://openai.com/' },
                { title: 'OpenAI News', url: 'https://openai.com/news/' },
              ],
            },
          },
        }),
      ],
    })
    const events = buildActivityEvents(round, { roundIndex: 0 })

    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('activity.webSearch')
    expect(events[0].summary).toBe('GPT-5.6 最新动态 · activity.sourcesCount|{"count":2}')
    expect((events[0].display as any).json.sources).toHaveLength(2)
  })

  it('文件检索不会被 file_search 名称误判为联网搜索（回归）', () => {
    const round = makeRound({
      toolCalls: [
        makeToolCall({
          name: 'file_search',
          type: 'analysis',
          arguments: { query: '唯一标记' },
          output: {
            summary: '搜索结果',
            query: '唯一标记',
            results: [{ fileName: 'qa.txt', content: 'marker' }],
          } as any,
        }),
      ],
    })
    const events = buildActivityEvents(round, { roundIndex: 0 })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      title: 'activity.fileSearch',
      toolName: 'file_search',
      summary: '搜索结果',
    })
    expect(events[0].title).not.toBe('activity.webSearch')
  })

  it('文件检索与网页搜索描述符保持互斥（边界）', () => {
    expect(isFileSearchActivityDescriptor('file_search 文件检索')).toBe(true)
    expect(isWebSearchActivityDescriptor('file_search 文件检索')).toBe(false)
    expect(isFileSearchActivityDescriptor('openai_web_search')).toBe(false)
    expect(isWebSearchActivityDescriptor('openai_web_search')).toBe(true)
  })

  it('失败的工具调用照样列出，并带上可展示的错误原因', () => {
    const round = makeRound({
      toolCalls: [
        makeToolCall({
          status: 'error',
          output: { error: 'internal', publicError: '命令执行失败' },
        }),
      ],
    })
    const [event] = buildActivityEvents(round)
    expect(event.status).toBe('error')
    expect(event.error).toBe('命令执行失败')
    expect(event.interrupted).toBeUndefined()
  })

  it('回合已进入终态时，仍标着执行中的工具按已中断展示', () => {
    const round = makeRound({ toolCalls: [makeToolCall({ status: 'loading' })] })
    expect(buildActivityEvents(round)[0].status).toBe('loading')
    const [event] = buildActivityEvents(round, { terminal: true })
    expect(event.status).toBe('error')
    expect(event.interrupted).toBe(true)
    expect(event.error).toBeUndefined()
  })

  it('当前搜索输出保留查询与安全展示字段', () => {
    const round = makeRound({
      toolCalls: [
        makeToolCall({
          name: 'web_search',
          output: {
            summary: '旧搜索摘要',
            queries: ['样例查询'],
            sources: [{ title: '公开来源', url: 'https://example.com' }],
          } as any,
        }),
      ],
    })
    const event = buildActivityEvents(round)[0]
    expect(event.title).toBe('activity.webSearch')
    expect(event.toolName).toBe('web_search')
    expect(event.output).toBeDefined()
  })
})

describe('buildMessageActivity', () => {
  const rounds = [
    makeRound({
      toolCalls: [
        makeToolCall({ id: 'call_1' }),
        makeToolCall({ id: 'call_2', status: 'error', output: { error: 'boom' } }),
        makeToolCall({ id: 'call_3', status: 'loading' }),
      ],
    }),
  ]

  it('回复进行中：有工具仍在执行时整条消息为运行中', () => {
    expect(buildMessageActivity(rounds, { loading: true }).status).toBe('running')
  })

  it('回合已进入终态：不再显示运行中，汇总写明未成功的次数（失败与已中断都算）', () => {
    const activity = buildMessageActivity(rounds, { terminal: true })
    expect(activity.status).toBe('success')
    expect(activity.events.map(event => event.status)).toEqual(['success', 'error', 'error'])
    expect(activity.summary).toBe('activity.toolCallsWithUnsuccessful|{"count":3,"failed":2}')
  })

  it('全部成功时汇总只写调用次数', () => {
    const activity = buildMessageActivity([makeRound({ toolCalls: [makeToolCall({})] })], {
      terminal: true,
    })
    expect(activity.summary).toBe('activity.toolCallsCount|{"count":1}')
  })
})

describe('过程话术进活动时间线', () => {
  it('回答轮之前的文字按轮次记为说明，排在思考之后、工具之前，不算工具调用', () => {
    const tool = (id: string) => ({ id, name: 'bash', status: 'success' as const, arguments: {} })
    const rounds = [
      { text: '先看数据。', thinking: '计划', phase: 'process' as const, toolCalls: [tool('t1')] },
      { text: '再算一下。', thinking: null, phase: 'process' as const, toolCalls: [tool('t2')] },
      { text: '结论：可行。', thinking: null, toolCalls: [] },
    ]
    const activity = buildMessageActivity(rounds as any, { terminal: true })
    expect(activity.events.map(event => `${event.type}:${event.roundIndex}`)).toEqual([
      'thinking:0',
      'note:0',
      'undefined:0',
      'note:1',
      'undefined:1',
    ])
    expect(activity.events.find(event => event.type === 'note')?.content).toBe('先看数据。')
    expect(activity.summary).toContain('2')
    expect(getActivityIconKey({ type: 'note', title: '说明' })).toBe('note')
  })
})
