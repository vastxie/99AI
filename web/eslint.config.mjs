import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

/**
 * 最小规则集：只查 Vue 模板与组件的基础错误（v-for 缺 key、改写 props、
 * 无效指令、模板里未用的变量……）。未用的变量与导入由 TypeScript（noUnusedLocals）把关，
 * 格式由 Prettier 负责，设计约束由 check:design 负责，这里都不重复
 */
export default [
  { ignores: ['dist/**', '**/node_modules/**'] },
  ...pluginVue.configs['flat/essential'],
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
  },
  {
    rules: {
      // 目录式组件（Foo/index.vue）与单词名的页面组件是本仓库的约定
      'vue/multi-word-component-names': 'off',
    },
  },
]
