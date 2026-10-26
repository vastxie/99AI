import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/locales'
import { useGlobalStoreWithOut } from '@/store/modules/global'
import MediaOutput from './MediaOutput.vue'
import { describeFileCard, filePreviewSource } from './outputFileCard'

const files = vi.hoisted(() => ({
  fetchPrivateFileBlob: vi.fn(),
  downloadBlob: vi.fn(),
  downloadUrl: vi.fn(),
}))

vi.mock('@/utils/privateFileAccess', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/privateFileAccess')>()),
  fetchPrivateFileBlob: files.fetchPrivateFileBlob,
}))
vi.mock('@/utils/download', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/download')>()),
  downloadBlob: files.downloadBlob,
  downloadUrl: files.downloadUrl,
}))
vi.mock('@/hooks/useViewport', async () => {
  const { ref } = await import('vue')
  return { useViewport: () => ({ isMobile: ref(false) }) }
})

const card = (file: Record<string, unknown>, userMessage = false, fallbackName = '') =>
  describeFileCard(file, 0, { userMessage, fallbackName })

describe('文件卡片的形态与动作', () => {
  it('源码文件可以打开预览，另有单独的下载键', () => {
    const script = card({ url: 'https://cdn.example.com/run.py', name: 'run.py' })
    expect(script).toMatchObject({ kind: 'source', canPreview: true, canDownload: true })
    expect(script.meta).toEqual(['PY', '预览'])
  })

  it('HTML 网页可以打开预览（隔离 iframe）；SVG 仍不在面板里渲染，只能下载', () => {
    expect(card({ url: 'https://cdn.example.com/page.html' })).toMatchObject({
      kind: 'source',
      canPreview: true,
      canDownload: true,
    })
    expect(card({ url: 'https://cdn.example.com/icon.svg' })).toMatchObject({
      kind: 'action',
      action: 'download',
      canPreview: false,
    })
  })

  it('音频出播放卡；用户消息里的附件不出播放卡，也不写动作说明', () => {
    expect(card({ url: 'https://cdn.example.com/a.mp3' }).kind).toBe('audio')
    const attached = card({ url: 'https://cdn.example.com/a.mp3', size: 2048 }, true)
    expect(attached).toMatchObject({ kind: 'action', action: 'download' })
    expect(attached.meta).toEqual(['MP3', '2.0 KB'])
  })

  it('平台文件：名称缺失时用工具输出的名称或「文件」，按类型补上扩展名', () => {
    const pdf = { fileId: 'file_q3', mime: 'application/pdf', size: 1024 }
    expect(card(pdf)).toMatchObject({ name: '文件.pdf', action: 'preview', tone: 'is-pdf' })
    expect(card(pdf, false, 'Q3 报告').name).toBe('Q3 报告.pdf')
    expect(card(pdf).meta).toEqual(['PDF', '1.0 KB', '预览'])
  })

  it('既不能预览也不能下载的只展示', () => {
    const hidden = card({
      url: 'https://cdn.example.com/a.bin',
      privateDownloadHidden: true,
    })
    expect(hidden).toMatchObject({ kind: 'readonly', action: null })
  })

  it('私有文件的预览来源走鉴权接口，能下载时带上取数与下载', () => {
    const download = vi.fn()
    const source = filePreviewSource(
      card({ fileId: 'file_q3', name: 'q3.xlsx', visibility: 'private' }),
      download
    )
    expect(source).toMatchObject({
      name: 'q3.xlsx',
      extension: 'xlsx',
      sourceKind: 'private-file',
      previewUrl: expect.stringMatching(/\/api\/files\/file_q3\/preview$/),
      downloadUrl: expect.stringMatching(/\/api\/files\/file_q3\/download$/),
      downloadFile: download,
    })
    expect(source.loadBlob).toBeTypeOf('function')
  })
})

describe('消息里的文件卡片', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  const render = (output: unknown) => {
    wrapper = mount(MediaOutput, { props: { output }, global: { plugins: [i18n] } })
    return wrapper
  }

  it('下载私有文件时显示进行中，重复点击只下载一次，完成后按服务端文件名保存', async () => {
    let finish: (value: unknown) => void = () => {}
    files.fetchPrivateFileBlob.mockReturnValue(new Promise(resolve => (finish = resolve)))
    const view = render({
      files: [{ fileId: 'file_zip', name: 'bundle.zip', visibility: 'private' }],
    })
    const button = view.get('button[aria-label="下载 bundle.zip"]')

    await button.trigger('click')
    await button.trigger('click')
    expect(files.fetchPrivateFileBlob).toHaveBeenCalledTimes(1)
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.find('.ui-spinner').exists()).toBe(true)

    const blob = new Blob(['zip'])
    finish({
      blob,
      response: new Response(null, {
        headers: { 'Content-Disposition': 'attachment; filename="release.zip"' },
      }),
    })
    await flushPromises()
    expect(files.downloadBlob).toHaveBeenCalledWith(blob, 'release.zip')
    expect(button.attributes('aria-busy')).toBeUndefined()
  })

  it('点源码卡片打开预览面板', async () => {
    const view = render({ files: [{ url: 'https://cdn.example.com/run.py', name: 'run.py' }] })
    await view.get('button[aria-label="预览 run.py"]').trigger('click')
    expect(useGlobalStoreWithOut().rightPreviewPanel).toMatchObject({
      type: 'file',
      file: { name: 'run.py', sourceKind: 'public-url' },
    })
  })
})
