/**
 * 控制台日志工具
 * 用于在开发环境下美化控制台输出
 */

interface ConsoleStyles {
  title: string
  info: string
  subtitle: string
  text: string
  warning: string
  error: string
  success: string
}

// 控制台样式定义
const CONSOLE_STYLES: ConsoleStyles = {
  title: 'color: #4783ee; font-size: 20px; font-weight: bold;',
  info: 'background-color: #000; color: #FFF700; padding: 2px 5px; border-radius: 2px;',
  subtitle: 'color: #4783ee; font-size: 16px;',
  text: 'color: #333;',
  warning: 'color: #f90; font-weight: bold;',
  error: 'color: #f00; font-weight: bold;',
  success: 'color: #0c0; font-weight: bold;',
}

/**
 * 打印99AI相关的控制台信息
 */
export function print99aiInfo(): void {
  if (process.env.NODE_ENV === 'production') return

  console.log('%c99AI', CONSOLE_STYLES.title)
  console.log(`林深时见鹿, 海深时见鲸, 情深时见你🌹

千里万里路, 不如自己部署😊

欢迎访问我们的开源项目👇

https://github.com/vastxie/99AI`)
}

/**
 * 打印自定义的控制台信息
 * @param title 标题
 * @param messages 消息内容数组
 * @param style 样式类型
 */
export function printCustomInfo(
  title: string,
  messages: string[],
  style: keyof ConsoleStyles = 'info'
): void {
  if (process.env.NODE_ENV === 'production') return

  console.log(`%c${title}`, CONSOLE_STYLES[style])
  messages.forEach(msg => console.log(msg))
}

/**
 * 打印应用初始化信息
 * @param appName 应用名称
 * @param version 版本号
 */
export function printAppInfo(appName: string, version: string): void {
  if (process.env.NODE_ENV === 'production') return

  console.log(`%c${appName} v${version}`, CONSOLE_STYLES.title)
  console.log(`%c应用初始化完成`, CONSOLE_STYLES.success)
  console.log(`环境: ${process.env.NODE_ENV}`)
  console.log(`时间: ${new Date().toLocaleString()}`)
}

export default {
  print99aiInfo,
  printCustomInfo,
  printAppInfo,
}
