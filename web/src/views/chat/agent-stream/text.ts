export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 字符的视觉宽度权重，用于平滑揭示的步长：
 * 汉字等全宽字符 1，ASCII 字母 / 数字 / 下划线 0.25，其余 ASCII 0.5，空白 0.1。
 * 这样中英文按视觉速度而不是字符数推进。
 */
export function visualWeight(codePoint: number): number {
  if (codePoint === 0x20 || codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x09) {
    return 0.1
  }
  if (codePoint <= 0x7f) {
    const isWordCharacter =
      (codePoint >= 0x30 && codePoint <= 0x39) ||
      (codePoint >= 0x41 && codePoint <= 0x5a) ||
      (codePoint >= 0x61 && codePoint <= 0x7a) ||
      codePoint === 0x5f
    return isWordCharacter ? 0.25 : 0.5
  }
  return 1
}

export function visualLength(text: string): number {
  let total = 0
  for (const character of text) {
    total += visualWeight(character.codePointAt(0) as number)
  }
  return total
}
