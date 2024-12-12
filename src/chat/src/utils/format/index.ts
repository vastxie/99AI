/**
 * 转义 HTML 字符
 * @param source
 */
export function encodeHTML(source: string) {
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 判断是否为代码块
 * @param text
 */
export function includeCode(text: string | null | undefined) {
  const regexp = /^(?:\s{4}|\t).+/gm
  return !!(text?.includes(' = ') || text?.match(regexp))
}

/**
 * 复制文本
 * @param options
 */
export function copyText(options: { text: string; origin?: boolean }) {
  const props = { origin: true, ...options }

  let input: HTMLInputElement | HTMLTextAreaElement

  if (props.origin)
    input = document.createElement('textarea')
  else
    input = document.createElement('input')

  input.setAttribute('readonly', 'readonly')
  input.value = props.text
  document.body.appendChild(input)
  input.select()
  if (document.execCommand('copy'))
    document.execCommand('copy')
  document.body.removeChild(input)
}

export function utcToShanghaiTime(utcTime: string, format: string): string {
  const date = new Date(utcTime)
  const shanghaiTime = date.getTime() + 8 * 60 * 60 * 1000
  const shanghaiDate = new Date(shanghaiTime)

  let result = format.replace('YYYY', shanghaiDate.getFullYear().toString())
  result = result.replace('MM', (`0${shanghaiDate.getMonth() + 1}`).slice(-2))
  result = result.replace('DD', (`0${shanghaiDate.getDate()}`).slice(-2))
  result = result.replace('hh', (`0${shanghaiDate.getHours()}`).slice(-2))
  result = result.replace('mm', (`0${shanghaiDate.getMinutes()}`).slice(-2))
  result = result.replace('ss', (`0${shanghaiDate.getSeconds()}`).slice(-2))

  return result
}
