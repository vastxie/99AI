import { describe, expect, it } from 'vitest'
import { resolveEffectiveModelConfig } from './modelConfig'

/**
 * 覆盖「选择器显示的模型」与「发送链路使用的模型」必须同源的解析规则。
 * 两侧都调用本函数，因此这里断言的就是二者一致的充分条件。
 */

const BASE_MODEL_INFO = { id: 1, model: 'gpt-5', modelName: 'GPT-5' }
const GROUP_MODEL_INFO = { id: 2, model: 'claude', modelName: 'Claude' }
const FALLBACK = { modelInfo: BASE_MODEL_INFO }

describe('resolveEffectiveModelConfig', () => {
  it('会话组自带模型时以会话为准，不被全局配置覆盖', () => {
    const session = { modelInfo: GROUP_MODEL_INFO, reasoningEffort: 'low' }
    expect(resolveEffectiveModelConfig(session, FALLBACK)).toEqual(session)
  })

  it('会话组 config 为空对象时回落到全局生效配置的模型', () => {
    expect(resolveEffectiveModelConfig({}, FALLBACK).modelInfo).toEqual(BASE_MODEL_INFO)
  })

  it('会话组 config 解析失败（null/undefined）时同样回落', () => {
    expect(resolveEffectiveModelConfig(null, FALLBACK).modelInfo).toEqual(BASE_MODEL_INFO)
    expect(resolveEffectiveModelConfig(undefined, FALLBACK).modelInfo).toEqual(BASE_MODEL_INFO)
  })

  it('回落时保留会话自有字段，只替换模型信息', () => {
    const session = { reasoningEffort: 'max', backgroundImg: 'a.png' }
    expect(
      resolveEffectiveModelConfig(session, { ...FALLBACK, backgroundImg: 'global.png' })
    ).toEqual({
      modelInfo: BASE_MODEL_INFO,
      reasoningEffort: 'max',
      backgroundImg: 'a.png',
    })
  })

  it('会话 modelInfo 残缺（无 model）时按无模型处理并取兜底，避免显示与发送错位', () => {
    const session = { modelInfo: { modelName: '已下架' } }
    expect(resolveEffectiveModelConfig(session, FALLBACK).modelInfo).toEqual(BASE_MODEL_INFO)
  })

  it('固定模型会话即使信息残缺也不被放宽为可切换', () => {
    const session = { modelInfo: { isFixedModel: 1 } }
    expect(resolveEffectiveModelConfig(session, FALLBACK)).toEqual(session)
  })

  it('全局兜底也没有可用模型时，模型信息为空而不是半截结构', () => {
    expect(resolveEffectiveModelConfig({}, {}).modelInfo).toBeUndefined()
    expect(
      resolveEffectiveModelConfig({ modelInfo: { modelName: 'X' } }, {}).modelInfo
    ).toBeUndefined()
  })

  it('非对象输入被安全归一，不抛异常', () => {
    expect(resolveEffectiveModelConfig('{}' as any, FALLBACK).modelInfo).toEqual(BASE_MODEL_INFO)
    expect(resolveEffectiveModelConfig([] as any, FALLBACK).modelInfo).toEqual(BASE_MODEL_INFO)
  })
})
