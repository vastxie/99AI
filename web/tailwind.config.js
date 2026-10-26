/** @type {import('tailwindcss').Config} */
/**
 * Tailwind 只做 token 到工具类的映射（颜色、层级、字体等都指向 styles/ 里的 CSS 变量）。
 * 组件配方（按钮、提示气泡、菜单、卡片等）写在 styles/recipes.css 的 components 层，
 * 不在这里用插件登记（设计守卫的 recipe-single-source 规则）。分工见 web/DESIGN.md。
 */
const primaryColor = step => `rgb(var(--primary-${step}) / <alpha-value>)`

module.exports = {
  darkMode: 'class',
  // 扩展包自带的 node_modules（pnpm workspace 子包）与测试文件不参与类扫描
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    '!./src/**/node_modules/**',
    '!./src/**/*.spec.ts',
  ],
  // 脚本里对同名变量取反（!input、!visible 等）会被当成「!important 工具类」生成出来：排除掉
  blocklist: ['!input', '!group', '!menu', '!avatar', '!visible'],
  theme: {
    // 过渡时长只有动效刻度（styles/tokens.css 的 --motion-duration-*）：duration-sm、duration-md 等，
    // 不再有数字档；不写时长的 transition-* 类默认 sm（150ms，与 Tailwind 原来的默认值一致）
    transitionDuration: {
      DEFAULT: 'var(--motion-duration-sm)',
      0: '0ms',
      xs: 'var(--motion-duration-xs)',
      sm: 'var(--motion-duration-sm)',
      md: 'var(--motion-duration-md)',
      lg: 'var(--motion-duration-lg)',
      xl: 'var(--motion-duration-xl)',
      '2xl': 'var(--motion-duration-2xl)',
    },
    // 圆角刻度在 styles/tokens.css（--radius-*，与这里的键同名同值）：改刻度时模板里的 rounded-* 一起变
    borderRadius: {
      none: '0px',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      '3xl': 'var(--radius-3xl)',
      full: 'var(--radius-full)',
    },
    // 阴影跟随主题（暗色下 Tailwind 默认的黑色阴影几乎看不见）：卡片与小控件 sm，浮层 md / lg，弹窗外壳 2xl
    boxShadow: {
      none: 'none',
      sm: 'var(--component-shadow-sm)',
      DEFAULT: 'var(--component-shadow-sm)',
      md: 'var(--component-shadow-md)',
      lg: 'var(--component-shadow-md)',
      xl: 'var(--dialog-shell-shadow)',
      '2xl': 'var(--dialog-shell-shadow)',
    },
    // 响应式前缀只有 md（768px，与 hooks/useViewport 的 isMobile 同一口径）：sm、lg 等前缀不再生成
    screens: {
      md: '768px',
    },
    extend: {
      // 不写缓动的 transition-* 类默认用 --motion-easing（DESIGN.md「缓动默认 --motion-easing」）
      transitionTimingFunction: {
        DEFAULT: 'var(--motion-easing)',
      },
      /*
       * 层级语义档位：数值统一定义在 styles/z-index.css。
       * 1 / 2 只给组件自己的层叠上下文里的局部堆叠（例如渲染中的遮罩压在图表上），不要用来跨组件排层级
       */
      zIndex: {
        1: '1',
        2: '2',
        content: 'var(--z-content)',
        composer: 'var(--z-composer)',
        'floating-button': 'var(--z-floating-button)',
        sidebar: 'var(--z-sidebar)',
        workspace: 'var(--z-workspace)',
        header: 'var(--z-header)',
        watermark: 'var(--z-watermark)',
        dialog: 'var(--z-dialog)',
        notification: 'var(--z-notification)',
        'dialog-elevated': 'var(--z-dialog-elevated)',
        viewer: 'var(--z-image-viewer)',
        sheet: 'var(--z-sheet)',
        confirm: 'var(--z-confirm)',
        critical: 'var(--z-critical)',
        message: 'var(--z-global-message)',
      },
      // 字体栈只有 tokens.css 的 --font-body / --font-mono（font-sans、font-mono 与 preflight 的 html 字体都指向它们）
      fontFamily: {
        sans: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      // 边框默认色跟随主题（preflight 给所有元素的 border-color，以及不带颜色的 border 类）
      borderColor: {
        DEFAULT: 'var(--app-border)',
      },
      colors: {
        primary: {
          DEFAULT: primaryColor(600),
          50: primaryColor(50),
          100: primaryColor(100),
          200: primaryColor(200),
          300: primaryColor(300),
          400: primaryColor(400),
          500: primaryColor(500),
          600: primaryColor(600),
          700: primaryColor(700),
          800: primaryColor(800),
          900: primaryColor(900),
          950: primaryColor(950),
        },
        // 强调色（跟随用户选的主题色）：页面里用它，不直接用 primary-* 色阶
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
        semantic: {
          success: 'var(--semantic-success)',
          warning: 'var(--semantic-warning)',
          danger: 'var(--semantic-danger)',
          info: 'var(--semantic-info)',
          'success-bg': 'var(--semantic-success-bg)',
          'warning-bg': 'var(--semantic-warning-bg)',
          'danger-bg': 'var(--semantic-danger-bg)',
          'info-bg': 'var(--semantic-info-bg)',
        },
        app: {
          canvas: 'var(--app-canvas)',
          'canvas-muted': 'var(--app-canvas-muted)',
          surface: 'var(--app-surface)',
          elevated: 'var(--app-surface-elevated)',
          sunken: 'var(--app-surface-sunken)',
          border: 'var(--app-border)',
          'border-strong': 'var(--app-border-strong)',
          divider: 'var(--app-divider)',
          overlay: 'var(--app-overlay)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
          inverse: 'var(--text-inverse)',
          link: 'var(--text-link)',
          'link-hover': 'var(--text-link-hover)',
          'on-accent': 'var(--text-on-accent)',
          'on-media': 'var(--text-on-media)',
          disabled: 'var(--text-disabled)',
        },
        chat: {
          user: 'var(--chat-user-bubble)',
          assistant: 'var(--chat-assistant-bubble)',
          'assistant-text': 'var(--chat-assistant-text)',
          input: 'var(--chat-input-surface)',
          'input-border': 'var(--chat-input-border)',
          activity: 'var(--chat-activity-accent)',
        },
        agent: {
          thinking: 'var(--agent-thinking)',
          preparing: 'var(--agent-preparing)',
          running: 'var(--agent-running)',
          success: 'var(--agent-success)',
          failed: 'var(--agent-failed)',
          placeholder: 'var(--agent-media-placeholder)',
          glow: 'var(--agent-glow-text)',
        },
        code: {
          background: 'var(--code-block-bg)',
          border: 'var(--code-block-border)',
          header: 'var(--code-block-header-bg)',
          text: 'var(--code-block-text)',
          keyword: 'var(--code-token-keyword)',
          title: 'var(--code-token-title)',
          string: 'var(--code-token-string)',
          number: 'var(--code-token-number)',
          comment: 'var(--code-token-comment)',
          meta: 'var(--code-token-meta)',
        },
        panel: {
          DEFAULT: 'var(--panel-bg)',
          border: 'var(--panel-border)',
          subtle: 'var(--panel-bg-subtle)',
          floating: 'var(--panel-bg)',
          'floating-hover': 'var(--panel-bg-subtle)',
        },
        /* ===== 按钮主题化系统 ===== */

        /* 1. 按钮背景色 */
        'btn-primary': 'var(--btn-bg-primary)',
        'btn-primary-hover': 'var(--btn-bg-primary-hover)',
        'btn-primary-active': 'var(--btn-bg-primary-active)',
        'btn-secondary': 'var(--btn-bg-secondary)',
        'btn-secondary-hover': 'var(--btn-bg-secondary-hover)',
        'btn-secondary-active': 'var(--btn-bg-secondary-active)',
        'btn-ghost': 'var(--btn-bg-ghost)',
        'btn-ghost-hover': 'var(--btn-bg-ghost-hover)',
        'btn-ghost-active': 'var(--btn-bg-ghost-active)',
        'btn-danger': 'var(--btn-bg-danger)',
        'btn-danger-hover': 'var(--btn-bg-danger-hover)',
        'btn-danger-active': 'var(--btn-bg-danger-active)',

        /* 2. 按钮文字颜色 */
        'btn-text-primary': 'var(--btn-text-primary)',
        'btn-text-secondary': 'var(--btn-text-secondary)',
        'btn-text-ghost': 'var(--btn-text-ghost)',
        'btn-text-danger': 'var(--btn-text-danger)',

        /* 3. 按钮边框 */
        'btn-primary-border': 'var(--btn-border-primary)',
        'btn-primary-border-hover': 'var(--btn-border-primary-hover)',
        'btn-primary-border-active': 'var(--btn-border-primary-active)',
        'btn-secondary-border': 'var(--btn-border-secondary)',
        'btn-secondary-border-hover': 'var(--btn-border-secondary-hover)',
        'btn-secondary-border-active': 'var(--btn-border-secondary-active)',
        'btn-danger-border': 'var(--btn-border-danger)',
      },
      textColor: {
        'semantic-success': 'var(--semantic-success-text)',
        'semantic-warning': 'var(--semantic-warning-text)',
        'semantic-danger': 'var(--semantic-danger-text)',
        'semantic-info': 'var(--semantic-info-text)',
      },
    },
  },
  plugins: [],
}
