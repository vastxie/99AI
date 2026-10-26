import vue from '@vitejs/plugin-vue'
import { createReadStream, existsSync } from 'node:fs'
import { cp, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ConfigEnv, Plugin, UserConfig } from 'vite'
import { loadEnv } from 'vite'
import { tsconfigPathsToAlias } from './tsconfig-paths'

const configDirname = import.meta.dirname
// pdf.js 的 cmaps / 标准字体 / wasm 解码器 / ICC 配置只有 rich-media 包用到，依赖也装在该包目录下；包被删除时目录不存在，插件自动跳过
const pdfjsDistDir = resolve(configDirname, 'src/packs/rich-media/node_modules/pdfjs-dist')

function getAssetContentType(filePath: string) {
  if (filePath.endsWith('.wasm')) return 'application/wasm'
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.json') || filePath.endsWith('.map')) {
    return 'application/json; charset=utf-8'
  }
  if (filePath.endsWith('.zip')) return 'application/zip'
  if (filePath.endsWith('.ttf')) return 'font/ttf'
  return 'application/octet-stream'
}

/**
 * PDF 预览要的运行时资源（字形、字体、wasm）原样复制到产物里。只有富媒体扩展包用得到：
 * 构建时关掉了它（VITE_RICH_MEDIA_ENABLED=false）就不复制（约 3.9 MB）
 */
function runtimeAssetPlugin(enabled: boolean): Plugin {
  const assetEntries = [
    {
      prefix: '/pdfjs/cmaps/',
      sourceDir: resolve(pdfjsDistDir, 'cmaps'),
      outputPath: 'pdfjs/cmaps',
    },
    {
      prefix: '/pdfjs/standard_fonts/',
      sourceDir: resolve(pdfjsDistDir, 'standard_fonts'),
      outputPath: 'pdfjs/standard_fonts',
    },
    {
      prefix: '/pdfjs/wasm/',
      sourceDir: resolve(pdfjsDistDir, 'wasm'),
      outputPath: 'pdfjs/wasm',
    },
    {
      prefix: '/pdfjs/iccs/',
      sourceDir: resolve(pdfjsDistDir, 'iccs'),
      outputPath: 'pdfjs/iccs',
    },
  ].filter(({ sourceDir }) => enabled && existsSync(sourceDir))
  // 构建输出目录以实际配置为准（命令行 --outDir 也生效）
  let outDir = resolve(configDirname, 'dist')

  return {
    name: '99agent-runtime-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          try {
            const requestUrl = req.url?.split('?')[0] || ''
            const matchedEntry = assetEntries.find(({ prefix }) => requestUrl.includes(prefix))
            if (!matchedEntry) return next()

            const { prefix, sourceDir } = matchedEntry
            const relativePath = requestUrl.slice(requestUrl.indexOf(prefix) + prefix.length)
            if (!relativePath || relativePath.includes('..')) return next()

            const filePath = resolve(sourceDir, relativePath)
            if (!filePath.startsWith(sourceDir) || !existsSync(filePath)) return next()

            const fileStat = await stat(filePath)
            if (!fileStat.isFile()) return next()
            res.statusCode = 200
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            res.setHeader('Content-Type', getAssetContentType(filePath))
            createReadStream(filePath).pipe(res)
          } catch {
            next()
          }
        })()
      })
    },
    async closeBundle() {
      await Promise.all(
        assetEntries.map(({ sourceDir, outputPath }) =>
          cp(sourceDir, resolve(outDir, outputPath), { recursive: true, force: true })
        )
      )
    },
  }
}

/**
 * 首屏去瀑布：对话页是按路由懒加载的分块，平时要等入口代码执行到路由那一步才开始下载。
 * 这里把它（连同它静态依赖的分块）写成 index.html 里的 modulepreload，和入口并行下载；
 * 它的样式用 preload 提前取回，不阻塞首帧（分块加载时照常插入样式表，命中缓存）
 */
function preloadChatRoutePlugin(routeModuleSuffix: string): Plugin {
  let base = '/'
  return {
    name: '99agent-preload-chat-route',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html
        const chunks = Object.values(bundle).filter(item => item.type === 'chunk')
        const route = chunks.find(chunk =>
          chunk.facadeModuleId?.replaceAll('\\', '/').endsWith(routeModuleSuffix)
        )
        if (!route) return html
        const scripts = new Set<string>()
        const styles = new Set<string>()
        const visit = (fileName: string) => {
          if (scripts.has(fileName)) return
          const chunk = bundle[fileName]
          if (!chunk || chunk.type !== 'chunk') return
          scripts.add(fileName)
          chunk.viteMetadata?.importedCss.forEach(css => styles.add(css))
          chunk.imports.forEach(visit)
        }
        visit(route.fileName)
        const href = (fileName: string) => `${base}${fileName}`
        const tags = [
          ...[...scripts]
            .filter(fileName => !html.includes(fileName))
            .map(fileName => ({
              tag: 'link',
              attrs: { rel: 'modulepreload', crossorigin: '', href: href(fileName) },
              injectTo: 'head' as const,
            })),
          ...[...styles]
            .filter(fileName => !html.includes(fileName))
            .map(fileName => ({
              tag: 'link',
              attrs: { rel: 'preload', as: 'style', href: href(fileName) },
              injectTo: 'head' as const,
            })),
        ]
        return { html, tags }
      },
    },
  }
}

/**
 * Vite 配置 - 使用最简单的原生配置
 * 避免复杂的自定义优化导致的初始化问题
 */
export default ({ mode }: ConfigEnv): UserConfig => {
  const env = loadEnv(mode, process.cwd())

  return {
    base: env.VITE_BASE_PATH || '/',

    plugins: [
      vue(),
      runtimeAssetPlugin(env.VITE_RICH_MEDIA_ENABLED !== 'false'),
      preloadChatRoutePlugin('src/views/chat/chat.vue'),
    ],

    resolve: {
      // 别名单源：由 tsconfig.json 的 compilerOptions.paths 派生（tsconfig-paths.ts），与 vue-tsc / vitest 一致
      alias: tsconfigPathsToAlias(),
    },

    // vue-i18n 只用组合式 API（createI18n({ legacy: false })）：关掉旧版 API，生产包里摇掉它；
    // 全局组件（<i18n-t>）照常注册，生产环境不带开发者工具
    define: {
      __VUE_I18N_LEGACY_API__: false,
      __VUE_I18N_FULL_INSTALL__: true,
      __INTLIFY_PROD_DEVTOOLS__: false,
    },

    server: {
      port: 9002,
      open: false,
      host: '0.0.0.0',
      proxy: {
        '^/api': {
          target: env.VITE_APP_API_BASE_URL || 'http://localhost:9520',
          changeOrigin: true,
          ws: true,
        },
      },
    },

    build: {
      // 构建目标用 Vite 默认的 Baseline Widely Available（Chrome / Edge 111+、Firefox 114+、Safari / iOS 16.4+），
      // 不再把语法降级到 ES2015；更早的浏览器（含旧版微信内置浏览器）不在支持范围内
      outDir: 'dist',
      // 使用 terser 进行压缩：变量名与函数名都混淆（见下方 mangle 的说明），删掉 console
      minify: 'terser',
      terserOptions: {
        compress: {
          // 只做压缩，不做代码优化
          drop_console: true,
          drop_debugger: false,
          pure_funcs: [],
          // 保留所有函数
          keep_fargs: true,
          keep_fnames: true,
        },
        // 2026-06-11 经用户拍板全量开启（产物约 -22%）：函数名一并混淆，
        // 生产报错堆栈不保留可读函数名，排障依赖交付前人工回归；
        // 全仓无函数名反射依赖（已 grep 核实），对照实验见任务目录 2026-06-11-deep-optimization-controller
        mangle: true,
        format: {
          // 保留注释
          comments: false,
        },
      },
      // 禁用报告压缩大小（加快构建）
      reportCompressedSize: false,
      // 不自定义复杂打包策略，让 Vite 自动处理
      rolldownOptions: {
        checks: {
          pluginTimings: false,
        },
        onLog(level, log, defaultHandler) {
          if (log.code === 'PLUGIN_TIMINGS') return
          defaultHandler(level, log)
        },
        output: {
          // 首屏必用、很少升级的第三方库单独成块：业务代码改动不再让它们的哈希失效（回访时命中缓存）。
          // 只列首屏确实会加载的库；按需加载的大库（编辑器、图表、PDF）不要放进来，否则会被提前下载
          codeSplitting: {
            groups: [
              {
                name: 'framework',
                test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:@vue[\\/](?:runtime-core|runtime-dom|reactivity|shared)|vue|vue-router|pinia|vue-i18n|@intlify|@vueuse[\\/](?:core|shared)|mitt)[\\/]/,
              },
            ],
          },
          // JS 分块沿用 Vite 默认的 assets/[name]-[hash].js。PDF 预览在相对 base 下按「分块目录的上一级」定位 pdfjs/
          //（rich-media 的 FilePreviewPanel.vue），调整分块目录深度时要同步检查
          // 只保留最基本的文件分类
          assetFileNames: assetInfo => {
            const info = assetInfo.name?.split('.')
            let extname = info?.at(-1)
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/iu.test(assetInfo.name || '')) {
              extname = 'images'
            } else if (/\.(woff2?|eot|ttf|otf)$/iu.test(assetInfo.name || '')) {
              extname = 'fonts'
            } else if (/\.css$/iu.test(assetInfo.name || '')) {
              extname = 'css'
            }
            return `${extname}/[name]-[hash][extname]`
          },
        },
      },
    },

    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'mitt'],
    },
  }
}
