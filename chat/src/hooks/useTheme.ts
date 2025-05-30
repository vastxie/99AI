export function useTheme() {
  const html = document.documentElement

  const init = () => {
    const saved = localStorage.getItem('theme')
    if (saved && (saved === 'dark' || saved === 'light')) {
      html.dataset.theme = saved
      html.classList.toggle('dark', saved === 'dark')
    } else {
      // 检测系统主题偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      html.dataset.theme = prefersDark ? 'dark' : 'light'
      html.classList.toggle('dark', prefersDark)
      localStorage.setItem('theme', html.dataset.theme)
    }
  }

  const toggle = () => {
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark'
    html.dataset.theme = next
    html.classList.toggle('dark', next === 'dark')
    localStorage.setItem('theme', next)
  }

  return { init, toggle }
}
