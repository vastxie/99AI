import { describe, expect, it } from 'vitest'
import type { Round } from '@/types/chat'
import { findReplyPresentation, presentedFileItems, processFileOutputs } from './replyPresentation'

const fileA = 'file_' + 'a'.repeat(24)
const fileB = 'file_' + 'b'.repeat(24)
const fileC = 'file_' + 'c'.repeat(24)
const item = (fileId: string, title: string) => ({ type: 'file', id: fileId, fileId, title })
const presentation = (files: unknown[], status = 'success', outputFiles: unknown[] = []) => ({
  id: `present-${status}-${files.length}`,
  name: '展示成果文件',
  type: 'presentation',
  status,
  display: { json: { presentation: files } },
  output: { files: outputFiles },
})
const delivery = {
  id: 'bash',
  name: 'bash',
  type: 'tool',
  status: 'success',
  output: { files: [item(fileA, 'clean.py'), item(fileB, 'report.pdf'), item(fileC, 'chart.png')] },
}
const rounds = (...toolCalls: unknown[][]) =>
  toolCalls.map(calls => ({ text: null, thinking: null, toolCalls: calls })) as unknown as Round[]

describe('replyPresentation', () => {
  it('uses the last successful selection, in its order, with files found in earlier deliveries', () => {
    const message = rounds(
      [delivery],
      [presentation([{ fileId: fileC }, { fileId: fileB, caption: '报告' }])],
      [presentation([{ fileId: fileA }], 'error')]
    )
    const found = findReplyPresentation(message)!
    expect(found.files.map(file => file.fileId)).toEqual([fileC, fileB])
    const presented = presentedFileItems(message, found)
    expect(presented.map(entry => [entry.key, entry.caption])).toEqual([
      [fileC, undefined],
      [fileB, '报告'],
    ])
    expect(presented[1].output.files[0].title).toBe('report.pdf')
    expect(processFileOutputs(message, found).flatMap(output => output.files)).toEqual([
      item(fileA, 'clean.py'),
    ])
  })

  it('treats an empty selection as "no deliverables" and keeps every file as a process file', () => {
    const message = rounds([delivery], [presentation([])])
    const found = findReplyPresentation(message)!
    expect(presentedFileItems(message, found)).toEqual([])
    expect(processFileOutputs(message, found).flatMap(output => output.files)).toHaveLength(3)
    expect(findReplyPresentation(rounds([delivery]))).toBeNull()
  })
})
