/** @type {import('tailwindcss').Config} */
/**
 * 主题设计理念说明
 *
 * 1. 设计系统基本原则
 *    - 一致性(Consistency): 确保UI元素在整个应用中保持一致
 *    - 可访问性(Accessibility): 支持所有用户的使用需求
 *    - 响应式(Responsive): 适应不同设备尺寸的界面
 *    - 直观性(Intuitive): 用户能够轻松理解和使用界面
 *
 * 2. 组件变体设计
 *    - 主要变体(Primary): 用于主要操作和强调重要性的元素
 *    - 次要变体(Secondary): 用于辅助操作和次要强调的元素
 *    - 幽灵变体(Ghost): 低视觉权重的交互元素，通常无背景
 *    - 危险变体(Danger): 表示危险操作或警告信息
 *
 * 3. 组件尺寸规范 (统一尺寸系统)
 *    - 特小(xs): 用于空间紧凑或次要位置的元素
 *    - 小型(sm): 用于辅助操作或较小区域
 *    - 中型(md): 默认标准尺寸，适用于大多数场景
 *    - 大型(lg): 强调重要性或需要更高可点击区域
 *    - 特大(xl): 用于主要焦点区域或特殊强调
 *
 *    所有组件使用统一的尺寸类:
 *    - btn-xs, btn-sm, btn-md, btn-lg, btn-xl
 *
 *    用法示例:
 *    <button class="btn btn-primary btn-lg">大按钮</button>
 *    <button class="btn-icon btn-primary btn-sm">小图标</button>
 *    <button class="btn-close btn-xs">小关闭按钮</button>
 *
 * 4. 状态设计
 *    - 正常(Normal): 组件的默认状态
 *    - 悬停(Hover): 鼠标指针悬停在元素上时的状态
 *    - 激活(Active): 元素被点击或当前活跃的状态
 *    - 禁用(Disabled): 元素不可交互的状态
 *    - 聚焦(Focus): 元素获得键盘焦点的状态
 *
 * 5. 主题模式
 *    - 亮色模式(Light): 默认浅色背景深色文字的模式
 *    - 暗色模式(Dark): 深色背景浅色文字的模式，减少夜间使用时的视觉疲劳
 */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        '3xl': '1750px',
        '4xl': '1870px',
      },
      keyframes: {
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        blink: {
          '0%, 100%': { 'background-color': 'currentColor' },
          '50%': { 'background-color': 'transparent' },
        },
        dotBounce: {
          '0%, 80%, 100%': {
            transform: 'translateY(-50%) scale(0.6)',
            opacity: 0.6,
          },
          '40%': {
            transform: 'translateY(-50%) scale(1)',
            opacity: 1,
          },
        },
        rotate: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '0%': { 'background-position': '-200% 0' },
          '100%': { 'background-position': '200% 0' },
        },
        glowBand: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        blink: 'blink 1.2s infinite steps(1, start)',
        rotate: 'rotate 1s linear infinite',
        'loading-dot': 'dotBounce 1.4s infinite ease-in-out',
        shimmer: 'shimmer 2s infinite linear',
        'glow-band': 'glowBand 1.5s infinite linear',
      },
      width: {
        sider: '60px',
      },
      minHeight: {
        28: '28px',
      },
      backgroundColor: {
        lightBg: 'linear-gradient(145deg, #F7F9FA 0%, #D9E9F0 50%, #F7F9FA 100%)',
      },
      backgroundImage: {
        'custom-gradient': '#f4f4f4',
        'primary-gradient': 'white',
      },
      colors: {
        'custom-gradient': '#f4f4f4',
        'primary-gradient': 'white',
        opacity: '#f4f4f4',
        gray: {
          50: '#f9f9f9',
          100: '#ececec',
          200: '#e3e3e3',
          300: '#cdcdcd',
          400: '#b4b4b4',
          500: '#9b9b9b',
          600: '#676767',
          700: '#424242',
          750: '#2f2f2f',
          800: '#212121',
          900: '#171717',
          950: '#0d0d0d',
        },
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
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
        'btn-danger': '#ef4444',
        'btn-danger-hover': '#dc2626',
        'btn-danger-active': '#b91c1c',
        'btn-success': '#10b981',
        'btn-success-hover': 'var(--btn-bg-success-hover)',
        'btn-success-active': 'var(--btn-bg-success-active)',
        'btn-warning': '#f59e0b',
        'btn-warning-hover': 'var(--btn-bg-warning-hover)',
        'btn-warning-active': 'var(--btn-bg-warning-active)',
        'btn-info': '#3b82f6',
        'btn-info-hover': 'var(--btn-bg-info-hover)',
        'btn-info-active': 'var(--btn-bg-info-active)',

        /* 2. 按钮文字颜色 */
        'btn-text-primary': 'var(--btn-text-primary)',
        'btn-text-secondary': 'var(--btn-text-secondary)',
        'btn-text-ghost': 'var(--btn-text-ghost)',
        'btn-text-danger': 'var(--btn-text-danger)',
        'btn-text-success': 'var(--btn-text-success)' /* 新增 */,
        'btn-text-warning': 'var(--btn-text-warning)' /* 新增 */,
        'btn-text-info': 'var(--btn-text-info)' /* 新增 */,

        /* 3. 按钮边框 */
        'btn-primary-border': 'var(--btn-border-primary)',
        'btn-primary-border-hover': 'var(--btn-border-primary-hover)',
        'btn-primary-border-active': 'var(--btn-border-primary-active)',
        'btn-secondary-border': 'var(--btn-border-secondary)',
        'btn-secondary-border-hover': 'var(--btn-border-secondary-hover)',
        'btn-secondary-border-active': 'var(--btn-border-secondary-active)',
        'btn-success-border': 'var(--btn-border-success)' /* 新增 */,
        'btn-warning-border': 'var(--btn-border-warning)' /* 新增 */,
        'btn-info-border': 'var(--btn-border-info)' /* 新增 */,
        'btn-danger-border': 'var(--btn-border-danger)' /* 新增 */,

        /* 4. 输入框主题 */
        input: {
          outline: 'none',
          transition: 'all 0.2s',
          backgroundColor: '#ffffff',
          color: '#424242',
          borderWidth: '1px',
          borderColor: '#e3e3e3',
          borderStyle: 'solid',
          '::placeholder': { color: '#9b9b9b' },
          '&:hover:not(:disabled)': { borderColor: '#cdcdcd' },
          '&:focus:not(:disabled)': {
            borderColor: '#4f46e5',
            boxShadow: '0 0 0 2px #4f46e522',
          },
          '&.is-error': {
            borderColor: '#ef4444',
            '&:focus': { boxShadow: '0 0 0 2px #ef444433' },
          },
          '&:disabled': { opacity: '.6', cursor: 'not-allowed' },
          '.dark &': {
            backgroundColor: '#2f2f2f',
            color: '#cdcdcd',
            borderColor: '#424242',
            '::placeholder': { color: '#9b9b9b' },
            '&:hover:not(:disabled)': { borderColor: '#676767' },
            '&:focus:not(:disabled)': {
              borderColor: '#818cf8',
              boxShadow: '0 0 0 2px #818cf822',
            },
            '&.is-error': {
              borderColor: '#f87171',
              '&:focus': { boxShadow: '0 0 0 2px #f8717133' },
            },
          },
        },

        /* 5. 按钮尺寸配置 */
        buttonSize: {
          xs: {
            padding: '0.125rem 0.5rem', // 2px 8px
            fontSize: '0.6875rem', // 11px
            lineHeight: '0.875rem', // 14px
            borderRadius: '0.375rem', // 6px
          },
          sm: {
            padding: '0.25rem 0.75rem', // 4px 12px
            fontSize: '0.75rem', // 12px
            lineHeight: '1rem', // 16px
            borderRadius: '0.5rem', // 8px
          },
          md: {
            padding: '0.5rem 1rem', // 8px 16px
            fontSize: '0.875rem', // 14px
            lineHeight: '1.25rem', // 20px
            borderRadius: '0.625rem', // 10px
          },
          lg: {
            padding: '0.75rem 1.25rem', // 12px 20px
            fontSize: '1rem', // 16px
            lineHeight: '1.5rem', // 24px
            borderRadius: '0.75rem', // 12px
          },
          xl: {
            padding: '1rem 1.5rem', // 16px 24px
            fontSize: '1.125rem', // 18px
            lineHeight: '1.75rem', // 28px
            borderRadius: '0.875rem', // 14px
          },
        },

        /* 6. 图标按钮尺寸配置 */
        iconButtonSize: {
          xs: {
            padding: '0.125rem', // 2px
            height: '1.25rem', // 20px
            width: '1.25rem', // 20px
            borderRadius: '0.375rem', // 6px
          },
          sm: {
            padding: '0.25rem', // 4px
            height: '1.5rem', // 24px
            width: '1.5rem', // 24px
            borderRadius: '0.5rem', // 8px
          },
          md: {
            padding: '0.375rem', // 6px
            height: '2rem', // 32px
            width: '2rem', // 32px
            borderRadius: '0.625rem', // 10px
          },
          lg: {
            padding: '0.5rem', // 8px
            height: '2.5rem', // 40px
            width: '2.5rem', // 40px
            borderRadius: '0.75rem', // 12px
          },
          xl: {
            padding: '0.625rem', // 10px
            height: '3rem', // 48px
            width: '3rem', // 48px
            borderRadius: '0.875rem', // 14px
          },
        },

        /* 7. 输入框尺寸配置 */
        inputSize: {
          sm: {
            padding: '0.25rem 0.5rem', // 4px 8px
            fontSize: '0.75rem', // 12px
            lineHeight: '1rem', // 16px
            borderRadius: '0.5rem', // 8px
          },
          md: {
            padding: '0.5rem 0.75rem', // 8px 12px
            fontSize: '0.875rem', // 14px
            lineHeight: '1.25rem', // 20px
            borderRadius: '0.625rem', // 10px
          },
          lg: {
            padding: '0.75rem 1rem', // 12px 16px
            fontSize: '1rem', // 16px
            lineHeight: '1.5rem', // 24px
            borderRadius: '0.75rem', // 12px
          },
        },
      },

      /* 5. 按钮尺寸配置 */
      buttonSize: {
        xs: {
          padding: '0.125rem 0.5rem', // 2px 8px
          fontSize: '0.6875rem', // 11px
          lineHeight: '0.875rem', // 14px
          borderRadius: '0.375rem', // 6px
        },
        sm: {
          padding: '0.25rem 0.75rem', // 4px 12px
          fontSize: '0.75rem', // 12px
          lineHeight: '1rem', // 16px
          borderRadius: '0.5rem', // 8px
        },
        md: {
          padding: '0.5rem 1rem', // 8px 16px
          fontSize: '0.875rem', // 14px
          lineHeight: '1.25rem', // 20px
          borderRadius: '0.625rem', // 10px
        },
        lg: {
          padding: '0.75rem 1.25rem', // 12px 20px
          fontSize: '1rem', // 16px
          lineHeight: '1.5rem', // 24px
          borderRadius: '0.75rem', // 12px
        },
        xl: {
          padding: '1rem 1.5rem', // 16px 24px
          fontSize: '1.125rem', // 18px
          lineHeight: '1.75rem', // 28px
          borderRadius: '0.875rem', // 14px
        },
      },

      /* 6. 图标按钮尺寸配置 */
      iconButtonSize: {
        xs: {
          padding: '0.125rem', // 2px
          height: '1.25rem', // 20px
          width: '1.25rem', // 20px
          borderRadius: '0.375rem', // 6px
        },
        sm: {
          padding: '0.25rem', // 4px
          height: '1.5rem', // 24px
          width: '1.5rem', // 24px
          borderRadius: '0.5rem', // 8px
        },
        md: {
          padding: '0.375rem', // 6px
          height: '2rem', // 32px
          width: '2rem', // 32px
          borderRadius: '0.625rem', // 10px
        },
        lg: {
          padding: '0.5rem', // 8px
          height: '2.5rem', // 40px
          width: '2.5rem', // 40px
          borderRadius: '0.75rem', // 12px
        },
        xl: {
          padding: '0.625rem', // 10px
          height: '3rem', // 48px
          width: '3rem', // 48px
          borderRadius: '0.875rem', // 14px
        },
      },

      /* 7. 输入框尺寸配置 */
      inputSize: {
        sm: {
          padding: '0.25rem 0.5rem', // 4px 8px
          fontSize: '0.75rem', // 12px
          lineHeight: '1rem', // 16px
          borderRadius: '0.5rem', // 8px
        },
        md: {
          padding: '0.5rem 0.75rem', // 8px 12px
          fontSize: '0.875rem', // 14px
          lineHeight: '1.25rem', // 20px
          borderRadius: '0.625rem', // 10px
        },
        lg: {
          padding: '0.75rem 1rem', // 12px 16px
          fontSize: '1rem', // 16px
          lineHeight: '1.5rem', // 24px
          borderRadius: '0.75rem', // 12px
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwind-scrollbar'),
    /**
     * 统一的按钮组件系统
     *
     * 设计理念:
     * - 变体(Variant): 定义按钮的外观类型(primary, secondary, ghost, danger等)
     * - 尺寸(Size): 使用统一的尺寸类(xs, sm, md, lg, xl)适用于所有按钮类型
     * - 状态(State): 定义按钮的不同状态样式(normal, hover, active, disabled)
     *
     * 使用方式:
     * - 基础按钮: <button class="btn btn-primary btn-md">按钮</button>
     * - 图标按钮: <button class="btn-icon btn-primary btn-sm">图标</button>
     * - 关闭按钮: <button class="btn-close btn-sm">×</button>
     * - 药丸按钮: <button class="btn-pill btn-md">选项</button>
     * - 禁用状态: <button class="btn btn-primary btn-md" disabled>禁用按钮</button>
     */
    function ({ addComponents, theme }) {
      addComponents({
        /* ===== 1. 基础按钮系统 ===== */

        /**
         * 按钮基础类 (.btn)
         * 所有按钮的通用基础样式
         */
        '.btn': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '500',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          '&:disabled': {
            opacity: '.6',
            cursor: 'not-allowed',
            pointerEvents: 'none',
          },
        },

        /* 按钮尺寸变体 */
        '.btn-xs': {
          padding: theme('buttonSize.xs.padding'),
          fontSize: theme('buttonSize.xs.fontSize'),
          lineHeight: theme('buttonSize.xs.lineHeight'),
          borderRadius: theme('buttonSize.xs.borderRadius'),
        },
        '.btn-sm': {
          padding: theme('buttonSize.sm.padding'),
          fontSize: theme('buttonSize.sm.fontSize'),
          lineHeight: theme('buttonSize.sm.lineHeight'),
          borderRadius: theme('buttonSize.sm.borderRadius'),
        },
        '.btn-md': {
          padding: theme('buttonSize.md.padding'),
          fontSize: theme('buttonSize.md.fontSize'),
          lineHeight: theme('buttonSize.md.lineHeight'),
          borderRadius: theme('buttonSize.md.borderRadius'),
        },
        '.btn-lg': {
          padding: theme('buttonSize.lg.padding'),
          fontSize: theme('buttonSize.lg.fontSize'),
          lineHeight: theme('buttonSize.lg.lineHeight'),
          borderRadius: theme('buttonSize.lg.borderRadius'),
        },
        '.btn-xl': {
          padding: theme('buttonSize.xl.padding'),
          fontSize: theme('buttonSize.xl.fontSize'),
          lineHeight: theme('buttonSize.xl.lineHeight'),
          borderRadius: theme('buttonSize.xl.borderRadius'),
        },

        /* 按钮变体类型 */

        /**
         * 主要按钮 (.btn-primary)
         * 用于表单提交、确认操作等主要操作
         */
        '.btn-primary': {
          backgroundColor: '#4f46e5' /* 主题色 */,
          color: '#ffffff',
          borderWidth: '0',
          borderColor: 'transparent',
          '&:hover:not(:disabled)': {
            backgroundColor: '#6366f1' /* 更浅色调 */,
            borderColor: 'transparent',
          },
          '&:active:not(:disabled)': {
            backgroundColor: '#4338ca' /* 更深色调 */,
            borderColor: 'transparent',
          },
          '.dark &': {
            backgroundColor: '#818cf8',
            color: '#ffffff',
            borderColor: 'transparent',
            '&:hover:not(:disabled)': {
              backgroundColor: '#6366f1',
              borderColor: 'transparent',
            },
            '&:active:not(:disabled)': {
              backgroundColor: '#4f46e5',
              borderColor: 'transparent',
            },
          },
        },

        /**
         * 次要按钮 (.btn-secondary)
         * 用于辅助操作、次级确认等
         */
        '.btn-secondary': {
          backgroundColor: '#ffffff',
          color: '#424242',
          borderWidth: '1px',
          borderColor: '#e3e3e3',
          '&:hover:not(:disabled)': {
            backgroundColor: '#f9f9f9',
            borderColor: '#cdcdcd',
          },
          '&:active:not(:disabled)': {
            backgroundColor: '#ececec',
            borderColor: '#b4b4b4',
          },
          '.dark &': {
            backgroundColor: '#2f2f2f',
            color: '#cdcdcd',
            borderColor: '#424242',
            '&:hover:not(:disabled)': {
              backgroundColor: '#424242',
              borderColor: '#676767',
            },
            '&:active:not(:disabled)': {
              backgroundColor: '#676767',
              borderColor: '#9b9b9b',
            },
          },
        },

        /**
         * 幽灵按钮 (.btn-ghost)
         * 用于低强调操作，通常是透明背景
         */
        '.btn-ghost': {
          backgroundColor: 'transparent',
          color: '#424242',
          borderWidth: '0',
          '&:hover:not(:disabled)': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
          '&:active:not(:disabled)': {
            backgroundColor: 'rgba(0, 0, 0, 0.08)',
          },
          '.dark &': {
            backgroundColor: 'transparent',
            color: '#cdcdcd',
            '&:hover:not(:disabled)': {
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
            },
            '&:active:not(:disabled)': {
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
            },
          },
        },

        /**
         * 危险按钮 (.btn-danger)
         * 用于删除、危险操作等需要警示的场景
         */
        '.btn-danger': {
          backgroundColor: '#ef4444',
          color: '#ffffff',
          borderWidth: '0',
          '&:hover:not(:disabled)': {
            backgroundColor: '#dc2626',
          },
          '&:active:not(:disabled)': {
            backgroundColor: '#b91c1c',
          },
          '.dark &': {
            backgroundColor: '#f87171',
            color: '#ffffff',
            '&:hover:not(:disabled)': {
              backgroundColor: '#ef4444',
            },
            '&:active:not(:disabled)': {
              backgroundColor: '#dc2626',
            },
          },
        },

        /**
         * 成功按钮 (.btn-success)
         * 用于表示成功、完成等积极操作
         */
        '.btn-success': {
          backgroundColor: '#10b981',
          color: '#ffffff',
          borderWidth: '0',
          borderColor: 'transparent',
          '&:hover:not(:disabled)': {
            backgroundColor: '#059669',
          },
          '&:active:not(:disabled)': {
            backgroundColor: '#047857',
          },
          '.dark &': {
            backgroundColor: '#10b981',
            color: '#ffffff',
            '&:hover:not(:disabled)': {
              backgroundColor: '#059669',
            },
            '&:active:not(:disabled)': {
              backgroundColor: '#047857',
            },
          },
        },

        /**
         * 警告按钮 (.btn-warning)
         * 用于需要注意但不危险的操作
         */
        '.btn-warning': {
          backgroundColor: '#f59e0b',
          color: '#ffffff',
          borderWidth: '0',
          borderColor: 'transparent',
          '&:hover:not(:disabled)': {
            backgroundColor: '#d97706',
          },
          '&:active:not(:disabled)': {
            backgroundColor: '#b45309',
          },
          '.dark &': {
            backgroundColor: '#f59e0b',
            color: '#ffffff',
            '&:hover:not(:disabled)': {
              backgroundColor: '#d97706',
            },
            '&:active:not(:disabled)': {
              backgroundColor: '#b45309',
            },
          },
        },

        /**
         * 信息按钮 (.btn-info)
         * 用于提示、信息性操作
         */
        '.btn-info': {
          backgroundColor: '#3b82f6',
          color: '#ffffff',
          borderWidth: '0',
          borderColor: 'transparent',
          '&:hover:not(:disabled)': {
            backgroundColor: '#2563eb',
          },
          '&:active:not(:disabled)': {
            backgroundColor: '#1d4ed8',
          },
          '.dark &': {
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            '&:hover:not(:disabled)': {
              backgroundColor: '#2563eb',
            },
            '&:active:not(:disabled)': {
              backgroundColor: '#1d4ed8',
            },
          },
        },

        /**
         * 发送按钮 (.btn-send)
         * 专用于聊天、评论等发送消息场景
         */
        '.btn-send': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '9999px' /* rounded-full */,
          padding: '0.5rem' /* p-2 */,
          height: '2rem' /* h-8 */,
          width: '2rem' /* w-8 */,
          fontSize: '1rem' /* text-base */,
          fontWeight: '600' /* font-semibold */,
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' /* shadow-sm */,
          backgroundColor: '#4f46e5' /* primary-600 */,
          color: '#ffffff' /* text-white */,
          transition: 'all 0.2s',
          '&:hover:not(:disabled)': {
            backgroundColor: '#4338ca' /* primary-700 */,
          },
          '&:disabled': {
            backgroundColor: '#a5b4fc' /* primary-300 */,
            opacity: '0.6',
            cursor: 'not-allowed',
          },
          '.dark &': {
            backgroundColor: '#424242' /* gray-750 - 参考btn-pill暗色默认背景 */,
            color: '#cdcdcd' /* gray-400 */,
            '&:hover:not(:disabled)': {
              backgroundColor: '#424242' /* 保持背景不变 */,
              color: '#ececec' /* gray-100 */,
            },
            '&:disabled': {
              backgroundColor: '#2f2f2f' /* gray-800 */,
            },
          },
        },

        /**
         * 停止按钮 (.btn-stop)
         * 用于停止生成内容的场景
         */
        '.btn-stop': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '9999px' /* rounded-full */,
          padding: '0.5rem' /* p-2 */,
          height: '2rem' /* h-8 */,
          width: '2rem' /* w-8 */,
          fontSize: '1rem' /* text-base */,
          fontWeight: '600' /* font-semibold */,
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' /* shadow-sm */,
          backgroundColor: '#4f46e5' /* primary-600 */,
          color: '#ffffff' /* text-white */,
          transition: 'all 0.2s',
          '&:hover:not(:disabled)': {
            backgroundColor: '#4338ca' /* primary-700 */,
          },
          '.dark &': {
            backgroundColor: '#676767' /* gray-600 - 参考btn-pill激活状态背景 */,
            color: '#ececec' /* gray-100 - 参考btn-pill激活状态文字 */,
            '&:hover': {
              backgroundColor: '#676767' /* 保持与非悬停状态相同 */,
              color: '#ececec' /* 保持与非悬停状态相同 */,
            },
          },
        },

        /* ===== 2. 图标按钮系统 ===== */

        /**
         * 图标按钮基础类 (.btn-icon)
         * 专为图标设计的按钮，可与尺寸类(btn-xs, btn-sm, btn-md, btn-lg, btn-xl)结合使用
         * 例如: <button class="btn-icon btn-md">图标</button>
         */
        '.btn-icon': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          cursor: 'pointer',
          backgroundColor: 'transparent' /* 透明背景 */,
          color: '#000' /* 黑色图标 */,
          overflow: 'hidden',
          position: 'relative',
          border: '0 solid transparent',
          fontWeight: '600',
          borderRadius: '10px' /* 使用s-radius-xs的值 */,
          aspectRatio: '1 / 1' /* 保持正方形 */,
          '&:hover:not(:disabled)': {
            backgroundColor: 'rgba(0, 0, 0, 0.06)' /* 对应--s-color-bg-trans-primary */,
          },
          '&:active:not(:disabled)': {
            backgroundColor: 'rgba(0, 0, 0, 0.1)' /* 对应--s-color-bg-trans-secondary */,
          },
          '&:disabled': {
            opacity: '.5',
            cursor: 'not-allowed',
            pointerEvents: 'none',
          },
          '.dark &': {
            color: '#cdcdcd' /* 暗色模式下的颜色 */,
            '&:hover:not(:disabled)': {
              backgroundColor: 'rgba(255, 255, 255, 0.08)' /* 暗色模式下的悬停颜色 */,
            },
            '&:active:not(:disabled)': {
              backgroundColor: 'rgba(255, 255, 255, 0.12)' /* 暗色模式下的激活颜色 */,
            },
          },
        },

        /**
         * 侧栏折叠图标按钮 (.btn-icon-collapse)
         * 用于侧栏折叠/展开的按钮，具有特定的悬停效果
         */
        '.btn-icon-collapse': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          cursor: 'pointer',
          backgroundColor: 'transparent',
          color: '#9b9b9b' /* gray-500 */,
          border: '0 solid transparent',
          fontWeight: '600',
          position: 'relative',
          overflow: 'hidden',
          '&:hover:not(:disabled)': {
            backgroundColor: '#ffffff' /* white */,
            color: '#6366f1' /* primary-500 */,
          },
          '&:active:not(:disabled)': {
            backgroundColor: '#ffffff',
            color: '#4f46e5' /* primary-600 */,
          },
          '&:disabled': {
            opacity: '.5',
            cursor: 'not-allowed',
            pointerEvents: 'none',
          },
          '.dark &': {
            color: '#9b9b9b' /* gray-500 */,
            '&:hover:not(:disabled)': {
              backgroundColor: '#2f2f2f' /* gray-750 */,
              color: '#cdcdcd' /* gray-400 */,
            },
            '&:active:not(:disabled)': {
              backgroundColor: '#2f2f2f',
              color: '#ececec' /* gray-100 */,
            },
          },
        },

        /* 按钮尺寸变体 - 同时适用于普通按钮和图标按钮 */
        '.btn-xs': {
          padding: theme('buttonSize.xs.padding'),
          fontSize: theme('buttonSize.xs.fontSize'),
          lineHeight: theme('buttonSize.xs.lineHeight'),
          borderRadius: theme('buttonSize.xs.borderRadius'),
          '.btn-icon&': {
            height: '24px',
            width: '24px',
            padding: '4px',
            fontSize: '14px',
          },
        },
        '.btn-sm': {
          padding: theme('buttonSize.sm.padding'),
          fontSize: theme('buttonSize.sm.fontSize'),
          lineHeight: theme('buttonSize.sm.lineHeight'),
          borderRadius: theme('buttonSize.sm.borderRadius'),
          '.btn-icon&': {
            height: '28px',
            width: '28px',
            padding: '6px',
            fontSize: '15px',
          },
        },
        '.btn-md': {
          padding: theme('buttonSize.md.padding'),
          fontSize: theme('buttonSize.md.fontSize'),
          lineHeight: theme('buttonSize.md.lineHeight'),
          borderRadius: theme('buttonSize.md.borderRadius'),
          '.btn-icon&': {
            height: '35px',
            width: '35px',
            padding: '7px',
            fontSize: '16px',
          },
        },
        '.btn-lg': {
          padding: theme('buttonSize.lg.padding'),
          fontSize: theme('buttonSize.lg.fontSize'),
          lineHeight: theme('buttonSize.lg.lineHeight'),
          borderRadius: theme('buttonSize.lg.borderRadius'),
          '.btn-icon&': {
            height: '40px',
            width: '40px',
            padding: '10px',
            fontSize: '18px',
          },
        },
        '.btn-xl': {
          padding: theme('buttonSize.xl.padding'),
          fontSize: theme('buttonSize.xl.fontSize'),
          lineHeight: theme('buttonSize.xl.lineHeight'),
          borderRadius: theme('buttonSize.xl.borderRadius'),
          '.btn-icon&': {
            height: '48px',
            width: '48px',
            padding: '12px',
            fontSize: '20px',
          },
        },

        /* ===== 3. 特殊按钮类型 ===== */

        /**
         * 关闭按钮 (.btn-close)
         * 专用于模态框、提示框等的关闭按钮
         */
        '.btn-close': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '0.375rem',
          transition: 'all 0.2s',
          backgroundColor: 'transparent',
          color: 'var(--btn-text-ghost)',
          cursor: 'pointer',
          '&:hover:not(:disabled)': {
            backgroundColor: 'var(--btn-bg-ghost-hover)',
          },
          '&:active:not(:disabled)': {
            backgroundColor: 'var(--btn-bg-ghost-active)',
          },
          '&:disabled': {
            opacity: '.6',
            cursor: 'not-allowed',
          },
        },

        /**
         * 验证码按钮 (.btn-captcha)
         * 用于短信/邮箱验证码输入框
         */
        '.btn-captcha': {
          position: 'absolute',
          right: '0',
          top: '0',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderTopRightRadius: '0.75rem',
          borderBottomRightRadius: '0.75rem',
          paddingLeft: '0.5rem',
          paddingRight: '0.5rem',
          fontSize: '1rem',
          lineHeight: '1rem',
          fontWeight: '600',
          backgroundColor: '#4f46e5',
          color: '#ffffff',
          transition: 'all 0.2s',
          '&:hover:not(:disabled)': {
            backgroundColor: '#6366f1',
          },
          '&:focus-visible': {
            outline: '2px solid transparent',
            outlineOffset: '2px',
          },
          '&:disabled': {
            opacity: '.6',
            cursor: 'not-allowed',
          },
          '.dark &': {
            backgroundColor: '#818cf8',
            color: '#ffffff',
            '&:hover:not(:disabled)': {
              backgroundColor: '#6366f1',
            },
          },
        },

        /**
         * 药丸按钮 (.btn-pill)
         * 全圆角、带文字的可交互按钮，有激活和非激活两种状态
         * 用于功能开关、选项切换等需要状态反馈的场景
         *
         * 特点:
         * - 全圆角设计，类似药丸形状
         * - 激活状态使用主题色突出显示
         * - 非激活状态使用白色背景，灰色文字
         * - 自动适配移动端和桌面端
         * - 完善的深色模式支持
         *
         * 用法:
         * <button class="btn-pill" :class="isActive ? 'btn-pill-active' : ''">
         *   <Icon /> <span>按钮文字</span>
         * </button>
         */
        '.btn-pill': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '9999px' /* rounded-full */,
          padding: '0.5rem',
          height: '2rem' /* h-8 */,
          fontSize: '0.875rem' /* text-sm */,
          fontWeight: '500',
          transition: 'all 0.15s ease',
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          border: '1px solid #cdcdcd' /* border-gray-100 */,
          backgroundColor: '#ffffff',
          color: '#6b7280' /* gray-500 */,
          boxShadow: '0 1px 1px rgba(0, 0, 0, 0.01)',

          /* 悬停效果 */
          '&:hover:not(:disabled)': {
            backgroundColor: '#f9f9f9' /* gray-50 */,
            color: '#4b5563' /* gray-600 */,
          },

          /* 暗色模式 */
          '.dark &': {
            backgroundColor: '#2f2f2f' /* gray-750 */,
            borderColor: '#2f2f2f' /* gray-750 */,
            color: '#9b9b9b' /* gray-500 */,
            '&:hover:not(:disabled)': {
              backgroundColor: '#424242' /* gray-700 */,
              color: '#cdcdcd' /* gray-300 */,
            },
          },

          /* 禁用状态 */
          '&:disabled': {
            opacity: '.6',
            cursor: 'not-allowed',
            pointerEvents: 'none',
          },
        },

        /**
         * 激活状态的药丸按钮 (.btn-pill-active)
         */
        '.btn-pill-active': {
          backgroundColor: '#e0e7ff' /* primary-100 */,
          borderColor: '#e0e7ff',
          color: '#4f46e5' /* primary-600 */,
          border: '1px solid #e0e7ff',

          // boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',

          /* 悬停效果 */
          '&:hover:not(:disabled)': {
            backgroundColor: '#e0e7ff' /* primary-100 */,
            borderColor: '#e0e7ff',
            color: '#4f46e5' /* primary-600 */,
          },

          '.dark &': {
            backgroundColor: '#676767' /* gray-600 */,
            borderColor: '#2f2f2f' /* gray-750 */,
            color: '#ececec' /* gray-100 */,
            '&:hover:not(:disabled)': {
              backgroundColor: '#676767' /* 保持背景不变 */,
              borderColor: '#2f2f2f' /* 保持边框不变 */,
              color: '#ececec' /* 保持文字颜色不变 */,
            },
          },
        },

        /* ===== 4. 输入框系统 ===== */

        /**
         * 输入框基础类 (.input)
         * 用于所有输入框元素
         */
        '.input': {
          outline: 'none',
          transition: 'all 0.2s',
          backgroundColor: '#ffffff',
          color: '#424242',
          borderWidth: '1px',
          borderColor: '#e3e3e3',
          borderStyle: 'solid',
          '::placeholder': { color: '#9b9b9b' },
          '&:hover:not(:disabled)': { borderColor: '#cdcdcd' },
          '&:focus:not(:disabled)': {
            borderColor: '#4f46e5',
            boxShadow: '0 0 0 2px #4f46e522',
          },
          '&.is-error': {
            borderColor: '#ef4444',
            '&:focus': { boxShadow: '0 0 0 2px #ef444433' },
          },
          '&:disabled': { opacity: '.6', cursor: 'not-allowed' },
          '.dark &': {
            backgroundColor: '#2f2f2f',
            color: '#cdcdcd',
            borderColor: '#424242',
            '::placeholder': { color: '#9b9b9b' },
            '&:hover:not(:disabled)': { borderColor: '#676767' },
            '&:focus:not(:disabled)': {
              borderColor: '#818cf8',
              boxShadow: '0 0 0 2px #818cf822',
            },
            '&.is-error': {
              borderColor: '#f87171',
              '&:focus': { boxShadow: '0 0 0 2px #f8717133' },
            },
          },
        },

        /* 输入框尺寸 */
        '.input-sm': {
          padding: theme('inputSize.sm.padding'),
          fontSize: theme('inputSize.sm.fontSize'),
          lineHeight: theme('inputSize.sm.lineHeight'),
          borderRadius: theme('inputSize.sm.borderRadius'),
        },
        '.input-md': {
          padding: theme('inputSize.md.padding'),
          fontSize: theme('inputSize.md.fontSize'),
          lineHeight: theme('inputSize.md.lineHeight'),
          borderRadius: theme('inputSize.md.borderRadius'),
        },
        '.input-lg': {
          padding: theme('inputSize.lg.padding'),
          fontSize: theme('inputSize.lg.fontSize'),
          lineHeight: theme('inputSize.lg.lineHeight'),
          borderRadius: theme('inputSize.lg.borderRadius'),
        },

        /* ===== 5. 标签切换组件 ===== */

        /**
         * 标签组容器 (.tab-group)
         */
        '.tab-group': {
          display: 'flex',
          width: '100%',
          justifyContent: 'center',
          borderRadius: '10px',
          padding: '2.5px',
          transition: 'all 0.2s',
          backgroundColor: '#ececec',
          '.dark &': {
            backgroundColor: '#212121',
          },
        },

        /* 标签组变体 */
        '.tab-group-default': {
          /* 默认样式已在基础类中定义 */
        },
        '.tab-group-filled': {
          backgroundColor: '#e2e8f0',
          '.dark &': {
            backgroundColor: '#334155',
          },
        },

        /**
         * 单个标签按钮 (.tab)
         */
        '.tab': {
          display: 'block',
          width: '100%',
          borderRadius: '10px',
          transition: 'all 0.15s ease',
          fontWeight: '500',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          textAlign: 'center',
          cursor: 'pointer',
          color: '#424242',
          '&:focus': {
            outline: 'none',
          },
          '.dark &': {
            color: '#9ca3af',
          },
        },

        /* 标签尺寸 */
        '.tab-sm': {
          padding: '0.25rem 0.5rem',
          fontSize: '0.75rem',
          lineHeight: '1rem',
        },
        '.tab-md': {
          padding: '0.375rem 0.75rem',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
        },
        '.tab-lg': {
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          lineHeight: '1.5rem',
        },

        /* 标签活动状态 */
        '.tab-active': {
          backgroundColor: '#ffffff',
          color: '#4f46e5',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          '.dark &': {
            backgroundColor: '#374151',
            color: '#f3f4f6',
          },
        },

        /* ===== 6. 悬停提示组件 ===== */

        /**
         * 悬停提示基础类 (.tooltip)
         * 为任何元素添加悬停提示，支持四个方向
         *
         * 用法:
         * 1. 将需要显示提示的元素包裹在具有group类的容器中
         * 2. 添加tooltip类及方向类(tooltip-top/right/bottom/left)
         *
         * 示例:
         * <div class="group relative">
         *   <button>悬停我</button>
         *   <div class="tooltip tooltip-top">提示内容</div>
         * </div>
         */
        '.tooltip': {
          position: 'absolute',
          padding: '0.5rem 0.75rem' /* py-2 px-3 */,
          backgroundColor: '#232629' /* 不使用半透明背景，确保颜色一致 */,
          color: '#ffffff',
          fontSize: '0.75rem' /* text-xs */,
          lineHeight: '1rem',
          borderRadius: '8px' /* s-radius-xxss */,
          whiteSpace: 'nowrap',
          opacity: '0',
          visibility: 'hidden',
          transition: 'opacity 0.2s ease, visibility 0.2s ease',
          transitionDelay: '0.5s' /* 显示时延迟0.3秒 */,
          zIndex: '9999' /* 提高z-index值，确保显示在所有元素之上 */,
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.15)',
          fontWeight: '500',
          pointerEvents: 'none',
          maxWidth: '250px',
          textAlign: 'center',

          /* 当父元素hover时显示 - 支持两种group类 */
          '.group:hover > &, .group-btn:hover > &': {
            opacity: '1',
            visibility: 'visible',
            transitionDelay: '0.5s' /* 显示时延迟0.3秒 */,
            pointerEvents: 'auto' /* 允许鼠标与tooltip交互 */,
          },

          /* 当鼠标离开时立即隐藏，不延迟 */
          '&': {
            transitionDelay: '0s',
          },

          '.dark &': {
            backgroundColor: '#424242' /* 暗色模式下更亮的颜色 */,
            color: '#ececec' /* gray-100 */,
          },

          /* 三角形箭头的共同样式 */
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '0.5rem',
            height: '0.5rem',
            backgroundColor: 'inherit' /* 确保与tooltip主体颜色完全相同 */,
            transform: 'rotate(45deg)',
          },
        },

        /* 添加 tooltip 位置类 */
        '.tooltip-top': {
          bottom: 'calc(100% + 0.5rem)',
          left: '50%',
          transform: 'translateX(-50%)',

          '&::before': {
            bottom: '-0.25rem',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
          },
        },

        '.tooltip-bottom': {
          top: 'calc(100% + 0.5rem)',
          left: '50%',
          transform: 'translateX(-50%)',

          '&::before': {
            top: '-0.25rem',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
          },
        },

        '.tooltip-right': {
          left: 'calc(100% + 0.5rem)',
          top: '50%',
          transform: 'translateY(-50%)',

          '&::before': {
            left: '-0.25rem',
            top: '50%',
            transform: 'translateY(-50%) rotate(45deg)',
          },
        },

        '.tooltip-left': {
          right: 'calc(100% + 0.5rem)',
          top: '50%',
          transform: 'translateY(-50%)',

          '&::before': {
            right: '-0.25rem',
            top: '50%',
            transform: 'translateY(-50%) rotate(45deg)',
          },
        },

        /* 提示框尺寸变体 */
        '.tooltip-sm': {
          padding: '0.25rem 0.5rem',
          fontSize: '0.7rem',
          borderRadius: '4px' /* s-radius-xxs */,
        },

        '.tooltip-lg': {
          padding: '0.75rem 1rem',
          fontSize: '0.875rem',
          borderRadius: '10px' /* s-radius-xs */,
        },

        /* 提示框颜色变体 */
        '.tooltip-primary': {
          backgroundColor: 'rgba(0, 87, 255, 0.9)' /* 品牌主色 */,
          '.dark &': {
            backgroundColor: 'rgba(0, 87, 255, 0.9)',
          },
        },

        '.tooltip-danger': {
          backgroundColor: 'rgba(249, 57, 32, 0.9)' /* 危险色 */,
          '.dark &': {
            backgroundColor: 'rgba(249, 57, 32, 0.9)',
          },
        },

        /* ===== 8. 菜单组件系统 ===== */

        /**
         * 菜单容器 (.menu)
         * 作为顶层容器，管理菜单的基本定位和z-index
         */
        '.menu': {
          position: 'relative',
          display: 'inline-block',
          zIndex: '50',
        },

        /* 菜单尺寸变体 */
        '.menu-sm': {
          '.menu-button': {
            height: '28px',
            minHeight: '28px',
            fontSize: '0.75rem',
          },
          '.menu-items': {
            width: '16rem' /* 256px */,
          },
          '.menu-item-icon': {
            width: '1.5rem',
            height: '1.5rem',
          },
        },
        '.menu-md': {
          '.menu-button': {
            height: '36px',
            minHeight: '36px',
            fontSize: '0.875rem',
          },
          '.menu-items': {
            width: '18rem' /* 288px */,
          },
          '.menu-item-icon': {
            width: '1.75rem',
            height: '1.75rem',
          },
        },
        '.menu-lg': {
          '.menu-button': {
            height: '44px',
            minHeight: '44px',
            fontSize: '1rem',
          },
          '.menu-items': {
            width: '20rem' /* 320px */,
          },
          '.menu-item-icon': {
            width: '2rem',
            height: '2rem',
          },
        },

        /**
         * 菜单触发按钮 (.menu-button)
         * 用于触发菜单的显示/隐藏
         */
        '.menu-button': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          transition: 'all 0.2s',
          cursor: 'pointer',
          fontWeight: '500',
          borderRadius: '0.5rem' /* 8px */,
          outline: 'none',
          '&:focus': {
            outline: 'none',
          },
        },

        /**
         * 菜单触发按钮样式变体 (.menu-trigger)
         * 专门用于Header等位置的模型选择等菜单触发按钮
         * 具有统一的外观和交互效果
         */
        '.menu-trigger': {
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0.75rem' /* px-3 py-2 */,
          fontSize: '0.875rem' /* text-sm */,
          fontWeight: '500' /* font-medium */,
          borderRadius: '0.5rem' /* rounded-lg */,
          backgroundColor: 'transparent',
          color: '#676767' /* gray-600 */,
          transition: 'all 0.2s',
          cursor: 'pointer',
          outline: 'none',
          '&:hover:not(:disabled)': {
            backgroundColor: '#f9f9f9' /* gray-50 */,
          },
          '&:focus': {
            outline: 'none',
          },
          '&:disabled': {
            opacity: '.6',
            cursor: 'not-allowed',
          },
          '.dark &': {
            color: '#b4b4b4' /* gray-400 */,
            '&:hover:not(:disabled)': {
              backgroundColor: '#2f2f2f' /* gray-750 */,
            },
          },
        },

        /* 菜单按钮类型变体 */
        '.menu-button-default': {
          backgroundColor: 'transparent',
          color: '#424242' /* gray-700 */,
          '&:hover': {
            backgroundColor: '#f9f9f9' /* gray-50 */,
          },
          '.dark &': {
            color: '#cdcdcd' /* gray-300 */,
            '&:hover': {
              backgroundColor: '#424242' /* gray-700 */,
            },
          },
        },
        '.menu-button-filled': {
          backgroundColor: '#ffffff',
          color: '#424242' /* gray-700 */,
          borderWidth: '1px',
          borderColor: '#e3e3e3' /* gray-200 */,
          '&:hover': {
            borderColor: '#cdcdcd' /* gray-300 */,
          },
          '.dark &': {
            backgroundColor: '#2f2f2f' /* gray-750 */,
            color: '#cdcdcd' /* gray-300 */,
            borderColor: '#424242' /* gray-700 */,
            '&:hover': {
              borderColor: '#676767' /* gray-600 */,
            },
          },
        },
        '.menu-button-active': {
          backgroundColor: '#e0e7ff' /* primary-100 */,
          color: '#4f46e5' /* primary-600 */,
          '.dark &': {
            backgroundColor: '#424242' /* gray-700 */,
            color: '#a5b4fc' /* primary-300 */,
          },
        },

        /**
         * 菜单项容器 (.menu-items)
         * 包含所有菜单项的下拉容器
         */
        '.menu-items': {
          position: 'absolute',
          width: 'auto',
          minWidth: '10rem',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          borderRadius: '0.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          border: '1px solid #e3e3e3' /* gray-200 */,
          zIndex: '50',
          '.dark &': {
            backgroundColor: '#2f2f2f' /* gray-750 */,
            borderColor: '#424242' /* gray-700 */,
          },
          /* 自定义滚动条样式 */
          '&.custom-scrollbar': {
            '&::-webkit-scrollbar': {
              width: '4px',
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#9b9b9b',
              borderRadius: '4px',
            },
            '.dark &::-webkit-scrollbar-thumb': {
              backgroundColor: '#676767',
            },
          },
        },

        /* 菜单项容器位置变体 */
        '.menu-items-top': {
          bottom: '100%',
          left: '0',
          transformOrigin: 'bottom left',
          marginBottom: '0.5rem',
        },
        '.menu-items-right': {
          left: '100%',
          top: '0',
          transformOrigin: 'top left',
          marginLeft: '0.5rem',
        },
        '.menu-items-bottom': {
          top: '100%',
          left: '0',
          transformOrigin: 'top left',
          marginTop: '0.5rem',
        },
        '.menu-items-left': {
          right: '100%',
          top: '0',
          transformOrigin: 'top right',
          marginRight: '0.5rem',
        },

        /* 额外的菜单对齐选项 */
        '.menu-items-center': {
          left: '50%',
          transform: 'translateX(-50%)',
        },
        '.menu-items-right-aligned': {
          right: '0',
          left: 'auto',
        },

        /**
         * 菜单项 (.menu-item)
         * 单个菜单选项
         */
        '.menu-item': {
          display: 'flex',
          alignItems: 'center',
          padding: '0.5rem 0.75rem',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          color: '#424242' /* gray-700 */,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.15s',
          borderRadius: '0.5rem',
          margin: '0.25rem',
          gap: '0.75rem',
          '&:hover, &:focus': {
            backgroundColor: '#f0f0f0',
          },
          '.dark &': {
            color: '#cdcdcd' /* gray-300 */,
            '&:hover, &:focus': {
              backgroundColor: '#3b3b3b',
            },
          },
        },

        /* 菜单项尺寸变体 */
        '.menu-item-sm': {
          padding: '0.375rem 0.5rem',
          fontSize: '0.75rem',
          gap: '0.5rem',
        },
        '.menu-item-md': {
          padding: '0.5rem 0.75rem',
          fontSize: '0.875rem',
          gap: '0.75rem',
        },
        '.menu-item-lg': {
          padding: '0.75rem 1rem',
          fontSize: '1rem',
          gap: '1rem',
        },

        /* 菜单项图标容器 */
        '.menu-item-icon': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.75rem',
          height: '1.75rem',
          borderRadius: '9999px',
          backgroundColor: 'transparent',
          flexShrink: 0,
          /* 尺寸变体 */
          '.menu-item-sm &': {
            width: '1.5rem',
            height: '1.5rem',
          },
          '.menu-item-md &': {
            width: '1.75rem',
            height: '1.75rem',
          },
          '.menu-item-lg &': {
            width: '2.5rem',
            height: '2.5rem',
          },
        },

        /* 菜单项内容容器 */
        '.menu-item-content': {
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minWidth: 0,
        },

        /* 菜单项标题 */
        '.menu-item-title': {
          fontWeight: '500',
          color: '#424242' /* gray-700 */,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          '.dark &': {
            color: '#ececec' /* gray-100 */,
          },
        },

        /* 菜单项描述 */
        '.menu-item-description': {
          fontSize: '0.75rem',
          color: '#9b9b9b' /* gray-500 */,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginTop: '0.125rem',
          '.dark &': {
            color: '#b4b4b4' /* gray-400 */,
          },
        },

        /* 菜单分割线 */
        '.menu-divider': {
          margin: '0.25rem 0',
          height: '1px',
          backgroundColor: '#e3e3e3' /* gray-200 */,
          '.dark &': {
            backgroundColor: '#424242' /* gray-700 */,
          },
        },

        /* 菜单项变体 */
        '.menu-item-active': {
          backgroundColor: '#f0f0f0',
          color: '#424242',
          '.dark &': {
            backgroundColor: '#3b3b3b',
            color: '#cdcdcd',
          },
        },
        '.menu-item-disabled': {
          color: '#9b9b9b' /* gray-500 */,
          cursor: 'not-allowed',
          '&:hover': {
            backgroundColor: 'transparent',
          },
          '.dark &': {
            color: '#676767' /* gray-600 */,
          },
        },
        '.menu-item-danger': {
          color: '#ef4444' /* red-500 */,
          '&:hover': {
            backgroundColor: '#fee2e2' /* red-100 */,
          },
          '.dark &': {
            color: '#f87171' /* red-400 */,
            '&:hover': {
              backgroundColor: '#7f1d1d' /* red-900 */,
            },
          },
        },

        /**
         * 操作图标按钮 (.btn-icon-action)
         * 专为操作类图标按钮设计，统一文字色与悬浮色，支持暗色模式
         */
        '.btn-icon-action': {
          color: '#9b9b9b', // gray-500
          transition: 'color 0.2s',
          '.dark &': {
            color: '#9b9b9b', // gray-500
          },
          '&:hover:not(:disabled)': {
            color: '#424242', // gray-700
          },
          '.dark &:hover:not(:disabled)': {
            color: '#ececec', // gray-300
          },
        },

        /**
         * 通用光泽光带效果 (.glow-band)
         * 可应用于各种组件，添加从左到右扫过的光泽效果
         * 适用于表示加载、处理中的状态
         *
         * 使用方式:
         * 1. 将此类添加到需要光泽效果的元素上
         * 2. 确保父元素有position: relative以正确定位光带
         *
         * 示例:
         * <div class="relative">
         *   <button class="btn">加载中</button>
         *   <div class="glow-band"></div>
         * </div>
         */
        '.glow-band': {
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          background:
            'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.2), transparent)',
          transform: 'translateX(-100%)',
          animation: 'glowBand 1.5s infinite linear',
          pointerEvents: 'none',
          zIndex: '1',
          '.dark &': {
            background:
              'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05), transparent)',
          },
        },

        /**
         * 内置光泽效果容器 (.glow-container)
         * 给元素添加relative定位并准备容纳光泽效果
         * 与.glow-band配合使用
         *
         * 示例:
         * <button class="glow-container">
         *   <span>加载中</span>
         *   <div class="glow-band"></div>
         * </button>
         */
        '.glow-container': {
          position: 'relative',
          overflow: 'hidden',
        },

        /* ===== 9. 头像组件系统 ===== */

        /**
         * 头像基础类 (.avatar)
         * 用于显示用户头像、模型图标等圆形图片或文字
         * 支持图片和文字两种内容类型
         *
         * 设计特点:
         * - 全圆角设计 (rounded-full)
         * - 等宽高比 (aspect-ratio: 1/1)
         * - 居中对齐内容
         * - 支持多种尺寸变体
         * - 溢出隐藏确保圆形效果
         *
         * 用法:
         * <div class="avatar avatar-md">
         *   <img src="avatar.jpg" alt="头像" class="w-full h-full object-cover" />
         * </div>
         *
         * <div class="avatar avatar-sm">
         *   <span class="text-sm font-medium">A</span>
         * </div>
         */
        '.avatar': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '9999px' /* rounded-full */,
          overflow: 'hidden',
          backgroundColor: '#f3f4f6' /* gray-100 */,
          color: '#6b7280' /* gray-500 */,
          fontWeight: '500',
          flexShrink: 0,
          aspectRatio: '1 / 1',
          /* 确保文字内容居中 */
          textAlign: 'center',
          lineHeight: '1',
          '.dark &': {
            backgroundColor: '#374151' /* gray-700 */,
            color: '#9ca3af' /* gray-400 */,
          },
        },

        /* 头像尺寸变体 */
        '.avatar-xs': {
          width: '1.25rem' /* 20px */,
          height: '1.25rem',
          fontSize: '0.625rem' /* 10px */,
        },
        '.avatar-sm': {
          width: '1.5rem' /* 24px */,
          height: '1.5rem',
          fontSize: '0.75rem' /* 12px */,
        },
        '.avatar-md': {
          width: '2rem' /* 32px */,
          height: '2rem',
          fontSize: '0.875rem' /* 14px */,
        },
        '.avatar-lg': {
          width: '2.25rem' /* 36px */,
          height: '2.25rem',
          fontSize: '1rem' /* 16px */,
        },
        '.avatar-xl': {
          width: '3rem' /* 48px */,
          height: '3rem',
          fontSize: '1.125rem' /* 18px */,
        },
        '.avatar-2xl': {
          width: '4rem' /* 64px */,
          height: '4rem',
          fontSize: '1.25rem' /* 20px */,
        },

        /* 头像样式变体 */
        '.avatar-primary': {
          backgroundColor: '#4f46e5' /* primary-600 */,
          color: '#ffffff' /* white */,
          '.dark &': {
            backgroundColor: '#4f46e5' /* 保持主题色 */,
            color: '#ffffff' /* white */,
          },
        },
        '.avatar-success': {
          backgroundColor: '#dcfce7' /* green-100 */,
          color: '#16a34a' /* green-600 */,
          '.dark &': {
            backgroundColor: '#14532d' /* green-900 */,
            color: '#4ade80' /* green-400 */,
          },
        },
        '.avatar-warning': {
          backgroundColor: '#fef3c7' /* amber-100 */,
          color: '#d97706' /* amber-600 */,
          '.dark &': {
            backgroundColor: '#451a03' /* amber-900 */,
            color: '#fbbf24' /* amber-400 */,
          },
        },
        '.avatar-danger': {
          backgroundColor: '#fee2e2' /* red-100 */,
          color: '#dc2626' /* red-600 */,
          '.dark &': {
            backgroundColor: '#7f1d1d' /* red-900 */,
            color: '#f87171' /* red-400 */,
          },
        },

        /* 头像边框变体 */
        '.avatar-bordered': {
          border: '1px solid #cdcdcd' /* gray-300，与btn-pill一致 */,
          '.dark &': {
            borderColor: '#2f2f2f' /* gray-750，与btn-pill一致 */,
          },
        },
        '.avatar-shadow': {
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        },

        /**
         * 头像组 (.avatar-group)
         * 用于显示多个头像的组合，支持重叠效果
         *
         * 用法:
         * <div class="avatar-group">
         *   <div class="avatar avatar-md"><img src="1.jpg" /></div>
         *   <div class="avatar avatar-md"><img src="2.jpg" /></div>
         *   <div class="avatar avatar-md"><img src="3.jpg" /></div>
         * </div>
         */
        '.avatar-group': {
          display: 'flex',
          alignItems: 'center',
          /* 头像重叠效果 */
          '& .avatar:not(:first-child)': {
            marginLeft: '-0.5rem',
          },
          /* 确保后面的头像在前面 */
          '& .avatar': {
            position: 'relative',
            border: '2px solid #ffffff',
            '.dark &': {
              borderColor: '#1f2937' /* gray-800 */,
            },
          },
        },
      })
    },
  ],
}
