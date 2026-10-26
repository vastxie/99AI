import { defineConfig } from '@playwright/test'

/**
 * 浏览器用例：对着一套已经启动的环境跑（构建后的前端 + server + 模拟模型），自己不启动任何服务。
 * 需要的环境变量见 e2e/support/env.ts，启动方式见 CONTRIBUTING.md。
 *
 * 浏览器三选一：E2E_BROWSER_CHANNEL（系统里装好的浏览器，如 chrome）、
 * E2E_CHROMIUM_PATH（指定可执行文件）；都不设时用 playwright install 装的 Chromium。
 */
const channel = process.env.E2E_BROWSER_CHANNEL
const executablePath = process.env.E2E_CHROMIUM_PATH

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.journey.ts',
  globalSetup: './e2e/support/global-setup.ts',
  // 所有用例共用一套后端与模拟模型：串行执行
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(channel ? { channel } : {}),
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
})
