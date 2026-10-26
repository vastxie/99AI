import { defineConfig, presetIcons, presetWind3, transformerVariantGroup } from 'unocss';
import { grayDark, grayLight } from './tokens/gray';
import { semanticDark, semanticLight } from './tokens/semantic';

/** 一组 CSS 变量 → 声明串 */
function declare(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
}

/**
 * gray-* 工具类指向灰阶 token 的通道值：token 随明暗主题切换，
 * 模板里的 text-gray-* / bg-gray-* 不用再写 dark: 变体。
 */
const GRAY_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const gray = Object.fromEntries(
  GRAY_STEPS.map((step) => [step, `rgb(var(--u-gray-${step}) / <alpha-value>)`]),
);

export default defineConfig({
  content: {
    pipeline: {
      include: [/\.(vue|html)($|\?)/u, 'src/**/*.{js,ts}'],
    },
  },
  theme: {
    colors: { gray },
  },
  // 两套主题的 token 写在同一处：浅色挂 :root，深色挂 html.dark（与 Element Plus 的暗色开关一致）
  preflights: [
    {
      getCSS: () =>
        [
          `:root{color-scheme:light;${declare({ ...grayLight, ...semanticLight })}}`,
          `html.dark{color-scheme:dark;${declare({ ...grayDark, ...semanticDark })}}`,
        ].join(''),
    },
  ],
  presets: [
    presetWind3(),
    presetIcons({
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  // hover-(a b) 这类分组写法
  transformers: [transformerVariantGroup()],
  configDeps: ['tokens/gray.ts', 'tokens/semantic.ts'],
});
