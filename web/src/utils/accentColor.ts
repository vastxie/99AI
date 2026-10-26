type RGB = readonly [number, number, number]

// Fixed, contrast-aware accents. Neutral surfaces and semantic status colors stay unchanged.
export const accentColors = {
  blue: { light: [58, 108, 220], dark: [103, 158, 254] },
  green: { light: [21, 128, 61], dark: [74, 222, 128] },
  amber: { light: [161, 98, 7], dark: [250, 204, 21] },
  pink: { light: [190, 24, 93], dark: [244, 114, 182] },
  orange: { light: [194, 65, 12], dark: [251, 146, 60] },
  violet: { light: [124, 58, 237], dark: [167, 139, 250] },
  neutral: { light: [65, 65, 65], dark: [209, 213, 219] },
} as const satisfies Record<string, { light: RGB; dark: RGB }>

export type AccentColor = keyof typeof accentColors
export const accentColorOptions = Object.keys(accentColors) as AccentColor[]

export function normalizeAccentColor(value: unknown): AccentColor {
  return typeof value === 'string' && Object.hasOwn(accentColors, value)
    ? (value as AccentColor)
    : 'blue'
}

export function applyAccentColor(value: unknown) {
  const color = normalizeAccentColor(value)
  const { light, dark } = accentColors[color]
  const mix = (rgb: RGB, target: number, amount: number) =>
    rgb.map(channel => Math.round(channel + (target - channel) * amount)).join(' ')
  const shades = {
    50: mix(light, 255, 0.95),
    100: mix(light, 255, 0.9),
    200: mix(light, 255, 0.8),
    300: mix(dark, 255, 0.35),
    400: dark.join(' '),
    500: mix(light, 255, 0.12),
    600: light.join(' '),
    700: mix(light, 0, 0.2),
    800: mix(light, 0, 0.4),
    900: mix(light, 0, 0.6),
    950: mix(light, 0, 0.75),
  }
  document.documentElement.dataset.accent = color
  for (const [shade, rgb] of Object.entries(shades)) {
    document.documentElement.style.setProperty(`--primary-${shade}`, rgb)
  }
  return color
}
