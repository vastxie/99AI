import { describe, expect, it, vi } from 'vitest'

vi.mock('@/locales', () => ({
  t: (key: string) => key,
  tp: (key: string) => key,
}))

import { buildStreamingToolCall, restoreMessageFileHandles } from './toolCalls'

describe('buildStreamingToolCall media assets', () => {
  it('normalizes streamed assets into recoverable private file entries', () => {
    const toolCall = buildStreamingToolCall({
      id: 'tool_image',
      name: '图片生成',
      status: 'success',
      assets: [
        {
          fileId: 'file_streamimage01',
          displayName: 'image.png',
          mimeType: 'image/png',
          size: 1024,
          role: 'final',
        },
      ],
    })

    expect((toolCall.output as any).files).toEqual([
      expect.objectContaining({
        id: 'file_streamimage01',
        fileId: 'file_streamimage01',
        type: 'image',
        title: 'image.png',
        mime: 'image/png',
        mimeType: 'image/png',
        visibility: 'private',
        privateDownloadHidden: true,
        privatePreviewHidden: true,
      }),
    ])
  })

  it('adds asset files to explicit streamed output when output has no files yet', () => {
    const toolCall = buildStreamingToolCall({
      id: 'tool_audio',
      name: '语音生成',
      status: 'success',
      output: { summary: '语音已生成' },
      assets: [
        {
          fileId: 'file_streamaudio01',
          displayName: 'speech.wav',
          mimeType: 'audio/wav',
          role: 'final',
        },
      ],
    })

    expect(toolCall.output).toMatchObject({
      summary: '语音已生成',
      files: [
        expect.objectContaining({
          id: 'file_streamaudio01',
          fileId: 'file_streamaudio01',
          type: 'audio',
          title: 'speech.wav',
        }),
      ],
    })
  })

  it('upgrades addressless streamed output files with matching asset identities', () => {
    const toolCall = buildStreamingToolCall({
      id: 'tool_video',
      name: '视频生成',
      status: 'success',
      output: {
        files: [
          {
            type: 'file',
            title: 'clip.mp4',
            role: 'final',
          },
        ],
      },
      assets: [
        {
          fileId: 'file_streamvideo01',
          displayName: 'clip.mp4',
          mimeType: 'video/mp4',
          role: 'final',
        },
      ],
    })

    expect((toolCall.output as any).files).toEqual([
      expect.objectContaining({
        id: 'file_streamvideo01',
        fileId: 'file_streamvideo01',
        type: 'video',
        title: 'clip.mp4',
        role: 'final',
        mime: 'video/mp4',
        privateDownloadHidden: true,
        privatePreviewHidden: true,
      }),
    ])
  })

  it('ignores streamed assets without a recoverable file identity', () => {
    const toolCall = buildStreamingToolCall({
      id: 'tool_legacy_asset',
      name: '旧资产',
      status: 'success',
      assets: [{ displayName: 'legacy.png', mimeType: 'image/png' }],
    })

    expect(toolCall.output).toBeUndefined()
  })
})

describe('buildStreamingToolCall hosted search output', () => {
  it('keeps OpenAI native search queries and sources from display json', () => {
    const toolCall = buildStreamingToolCall({
      id: 'ws_1',
      name: 'openai_web_search',
      type: 'search',
      status: 'success',
      output: {
        summary: '搜索完成',
      },
      display: {
        json: {
          queries: ['GPT-5.6 最新动态'],
          sources: [{ title: 'OpenAI', url: 'https://openai.com/' }],
        },
      },
    })

    expect(toolCall.output).toMatchObject({
      summary: '搜索完成',
      queries: ['GPT-5.6 最新动态'],
      sources: [{ title: 'OpenAI', url: 'https://openai.com/' }],
    })
  })
})

describe('restoreMessageFileHandles', () => {
  it('copies private file ids from the local tool call into a public snapshot', () => {
    const previous = {
      rounds: [
        {
          toolCalls: [
            {
              id: 'call_1',
              status: 'success',
              assets: [{ fileId: 'file_localabc', role: 'final', displayName: 'note.txt' }],
              output: {
                files: [
                  {
                    fileRef: 'output_file_1',
                    id: 'file_localabc',
                    fileId: 'file_localabc',
                    title: 'note.txt',
                    privateDownloadHidden: true,
                    privatePreviewHidden: true,
                  },
                ],
              },
            },
          ],
        },
      ],
    }
    const snapshot = {
      rounds: [
        {
          toolCalls: [
            {
              id: 'call_1',
              status: 'success',
              output: {
                files: [
                  { fileRef: 'output_file_1', title: 'note.txt', privateDownloadHidden: true },
                ],
              },
            },
          ],
        },
      ],
    }
    const merged = restoreMessageFileHandles(previous, snapshot)
    expect(merged.rounds[0].toolCalls[0].output.files[0]).toMatchObject({
      fileId: 'file_localabc',
      id: 'file_localabc',
      privateDownloadHidden: true,
      privatePreviewHidden: true,
    })
    expect(merged.rounds[0].toolCalls[0]).not.toHaveProperty('result')
    expect(merged.rounds[0].toolCalls[0].assets).toEqual(previous.rounds[0].toolCalls[0].assets)
  })

  it('leaves snapshot files alone when they already carry handles or nothing local matches', () => {
    const previous = { rounds: [{ toolCalls: [{ id: 'call_x', output: { files: [] } }] }] }
    const snapshot = {
      rounds: [
        {
          toolCalls: [
            { id: 'call_1', output: { files: [{ fileId: 'file_ownhandle', title: 'a.txt' }] } },
          ],
        },
      ],
    }
    const merged = restoreMessageFileHandles(previous, snapshot)
    expect(merged.rounds[0].toolCalls[0].output.files[0].fileId).toBe('file_ownhandle')
  })
})
