import { describe, expect, it } from 'vitest'
import { getActivityTimelineIconClass } from './activityIcons'

describe('活动时间线图标颜色', () => {
  it('失败用危险色；已中断与状态文字一样用弱化色', () => {
    expect(getActivityTimelineIconClass({ status: 'error' })).toContain('text-semantic-danger')
    expect(getActivityTimelineIconClass({ status: 'error', interrupted: true })).toBe(
      'text-text-subtle'
    )
    expect(getActivityTimelineIconClass({ status: 'loading' })).toContain('animate-pulse')
    expect(getActivityTimelineIconClass({ status: 'success' })).toBe('text-text-subtle')
  })
})
