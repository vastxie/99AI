import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

type WriteText = (text: string) => Promise<void>

/** happy-dom 的 navigator.clipboard 是原型访问器，用实例属性覆盖以模拟可用 / 不可用 */
function stubClipboard(writeText: WriteText | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

/** happy-dom 不实现 execCommand，按用例注入实现 */
function stubExecCommand(impl: (command: string) => boolean) {
  const spy = vi.fn(impl)
  Object.defineProperty(document, 'execCommand', { configurable: true, value: spy })
  return spy
}

afterEach(() => {
  delete (navigator as { clipboard?: unknown }).clipboard
  delete (document as { execCommand?: unknown }).execCommand
})

describe('copyText 剪贴板单源', () => {
  it('Clipboard API 可用：写入成功返回 true，不走 execCommand 回退', async () => {
    const writeText = vi.fn<WriteText>().mockResolvedValue(undefined)
    stubClipboard(writeText)
    const execCommand = stubExecCommand(() => true)

    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(execCommand).not.toHaveBeenCalled()
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('Clipboard API 不可用：回退隐藏 textarea + execCommand，完成后清理节点', async () => {
    stubClipboard(undefined)
    const execCommand = stubExecCommand(command => {
      expect(command).toBe('copy')
      const textarea = document.querySelector('textarea')
      expect(textarea?.value).toBe('fallback text')
      expect(textarea?.getAttribute('readonly')).toBe('readonly')
      expect(textarea?.style.position).toBe('fixed')
      return true
    })

    await expect(copyText('fallback text')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledOnce()
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('Clipboard API 被拒绝（非安全上下文 / 无权限）时同样回退 execCommand', async () => {
    stubClipboard(vi.fn<WriteText>().mockRejectedValue(new Error('denied')))
    const execCommand = stubExecCommand(() => true)

    await expect(copyText('retry')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('两条路径都失败时返回 false 而不抛错，节点仍被清理', async () => {
    stubClipboard(vi.fn<WriteText>().mockRejectedValue(new Error('denied')))
    stubExecCommand(() => false)
    await expect(copyText('nope')).resolves.toBe(false)

    stubExecCommand(() => {
      throw new Error('blocked')
    })
    await expect(copyText('nope')).resolves.toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })
})
