import { describe, expect, it } from 'vitest'
import { getTextareaMaxHeight } from './footer.helpers'

describe('Footer textarea height', () => {
  it('uses the smaller CSS viewport cap on short screens', () => {
    expect(getTextareaMaxHeight(24, 16, 180)).toBe(180)
  })

  it('keeps the eight-line cap when the viewport has enough height', () => {
    expect(getTextareaMaxHeight(20, 16, 300)).toBe(176)
  })

  it('falls back to the line cap when CSS has no finite maximum', () => {
    expect(getTextareaMaxHeight(20, 16, Number.NaN)).toBe(176)
  })
})
