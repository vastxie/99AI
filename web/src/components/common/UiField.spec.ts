import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import UiField from './UiField.vue'

function renderField(props: { label: string; hint?: string; error?: string; hideLabel?: boolean }) {
  return mount(
    defineComponent({
      setup() {
        return () =>
          h(UiField, props, {
            default: ({ control }: { control: Record<string, unknown> }) =>
              h('input', { ...control, class: 'input' }),
          })
      },
    })
  )
}

describe('表单字段', () => {
  it('标签指向控件，说明挂在 aria-describedby 上', () => {
    const wrapper = renderField({ label: '新密码', hint: '6-30 个字符' })
    const input = wrapper.get('input')
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    const hint = wrapper.get('.ds-form-helper')
    expect(input.attributes('aria-describedby')).toBe(hint.attributes('id'))
    expect(input.attributes('aria-invalid')).toBeUndefined()
  })

  it('有错误时控件标为无效，错误挂在控件的描述上（不另设 alert：校验没过时焦点会落到字段上读出它，不读两遍）', () => {
    const error = ref('请输入新密码')
    const wrapper = renderField({ label: '新密码', hint: '6-30 个字符', error: error.value })
    const input = wrapper.get('input')
    const errorText = wrapper.get('.ds-form-error')
    expect(errorText.text()).toBe('请输入新密码')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(input.attributes('aria-invalid')).toBe('true')
    // 错误不是规则本身：规则照样显示
    expect(wrapper.findAll('.ds-form-helper')).toHaveLength(2)
    expect(input.attributes('aria-describedby')?.split(' ')).toContain(errorText.attributes('id'))
  })

  it('错误就是规则本身（与说明同一句）时只显示一行', () => {
    const wrapper = renderField({
      label: '用户名',
      hint: '用户名 2-12 位',
      error: '用户名 2-12 位',
    })
    expect(wrapper.findAll('.ds-form-helper')).toHaveLength(1)
    expect(wrapper.get('input').attributes('aria-describedby')).toBe(
      wrapper.get('.ds-form-error').attributes('id')
    )
  })

  it('紧凑表单可以视觉隐藏标签，读屏仍能读到', () => {
    const wrapper = renderField({ label: '账号', hideLabel: true })
    expect(wrapper.get('label').classes()).toContain('sr-only')
  })
})
