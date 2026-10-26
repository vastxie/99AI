import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob, downloadText, downloadUrl, filenameFromContentDisposition } from './download'

let clicked: HTMLAnchorElement[] = []

beforeEach(() => {
  vi.useFakeTimers()
  clicked = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clicked.push(this)
  })
  URL.createObjectURL = vi.fn(() => 'blob:download-test') as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('统一下载工具', () => {
  it('blob 下载按文件名保存，点击后稍等再释放临时地址，链接不留在页面里', () => {
    downloadBlob(new Blob(['x']), '报告.pdf')
    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('报告.pdf')
    expect(clicked[0].target).toBe('')
    expect(document.querySelector('a')).toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download-test')
  })

  it('文本内容按给定类型打包下载', () => {
    downloadText('<svg/>', 'chart.svg', 'image/svg+xml;charset=utf-8')
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('image/svg+xml;charset=utf-8')
    expect(clicked[0].download).toBe('chart.svg')
  })

  it('普通网址在新标签页打开，不把当前页面带走；可执行地址直接拦下', () => {
    downloadUrl('https://cdn.example.com/a.png', 'a.png')
    expect(clicked[0].target).toBe('_blank')
    expect(clicked[0].rel).toBe('noopener noreferrer')

    downloadUrl('javascript:alert(1)', 'x')
    downloadUrl('')
    expect(clicked).toHaveLength(1)
  })

  it('按浏览器解析后的协议放行：开头空白、中间的制表符换行藏不住可执行地址；data 要带文件名', () => {
    for (const url of [
      ' javascript:alert(1)',
      '\njavascript:alert(1)',
      'java\tscript:alert(1)',
      'VBScript:x',
      'data:text/html,<b>x</b>',
      'file:///etc/passwd',
    ]) {
      downloadUrl(url)
    }
    expect(clicked).toHaveLength(0)

    downloadUrl('/api/files/file_1/download', 'a.pdf')
    downloadUrl('blob:http://localhost/id', 'a.png')
    downloadUrl('data:image/png;base64,AAAA', 'a.png')
    expect(clicked.map(link => link.download)).toEqual(['a.pdf', 'a.png', 'a.png'])
  })

  it('从 Content-Disposition 取文件名，优先 filename*', () => {
    expect(
      filenameFromContentDisposition(
        `attachment; filename="report.pdf"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf`
      )
    ).toBe('报告.pdf')
    expect(filenameFromContentDisposition('attachment; filename="report.pdf"')).toBe('report.pdf')
    expect(filenameFromContentDisposition('attachment; filename=plain.txt; size=3')).toBe(
      'plain.txt'
    )
    expect(filenameFromContentDisposition(null)).toBe('')
  })
})
