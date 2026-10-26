import { afterEach, describe, expect, it, vi } from 'vitest'
import { message, notifyError } from './message'

afterEach(() => {
  message().destroy()
  vi.restoreAllMocks()
})

describe('notifyError', () => {
  it('请求层已经提示过的错误不再提示；其余错误提示调用方给的文案', () => {
    const error = vi.spyOn(message(), 'error')
    notifyError(Object.assign(new Error('x'), { notified: true }), '保存失败')
    expect(error).not.toHaveBeenCalled()
    notifyError(new Error('本地异常'), '保存失败')
    expect(error).toHaveBeenCalledWith('保存失败')
  })
})
