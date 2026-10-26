// 注册样式覆盖，确保主题切换时正确应用对应样式
export const injectThemeStyles = () => {
  // 检查是否已存在样式元素
  const existingStyle = document.getElementById('highlight-theme-overrides')
  if (existingStyle) return

  // 创建新的样式元素
  const style = document.createElement('style')
  style.id = 'highlight-theme-overrides'
  style.textContent = `
    html .hljs {
      background: transparent !important;
      color: var(--code-block-text) !important;
    }

    html .hljs-doctag,
    html .hljs-keyword,
    html .hljs-meta .hljs-keyword,
    html .hljs-template-tag,
    html .hljs-template-variable,
    html .hljs-type,
    html .hljs-variable.language_ {
      color: var(--code-token-keyword) !important;
    }

    html .hljs-title,
    html .hljs-title.class_,
    html .hljs-title.class_.inherited__,
    html .hljs-title.function_ {
      color: var(--code-token-title) !important;
    }

    html .hljs-regexp,
    html .hljs-string,
    html .hljs-meta .hljs-string {
      color: var(--code-token-string) !important;
    }

    html .hljs-attr,
    html .hljs-attribute,
    html .hljs-literal,
    html .hljs-meta,
    html .hljs-number,
    html .hljs-operator,
    html .hljs-variable,
    html .hljs-selector-attr,
    html .hljs-selector-class,
    html .hljs-selector-id {
      color: var(--code-token-number) !important;
    }

    html .hljs-comment,
    html .hljs-code,
    html .hljs-formula {
      color: var(--code-token-comment) !important;
    }

    html .hljs-built_in,
    html .hljs-symbol,
    html .hljs-name,
    html .hljs-quote,
    html .hljs-selector-tag,
    html .hljs-selector-pseudo,
    html .hljs-section,
    html .hljs-bullet {
      color: var(--code-token-meta) !important;
    }
  `
  document.head.appendChild(style)
}
