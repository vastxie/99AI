import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import { createVitePlugins } from './vite/plugins'

export default defineConfig(({ mode }) => {
  const viteEnv = loadEnv(mode, process.cwd()) as unknown as ImportMetaEnv
  const isBuild = mode === 'production'

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: createVitePlugins(isBuild),
    server: {
      host: '0.0.0.0',
      port: 9002,
      open: false,
      proxy: {
        '/api': {
          target: viteEnv.VITE_APP_API_BASE_URL,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api/, '/api/'),
        },
      },
    },
    clearScreen: false,
    envPrefix: ['VITE_'],
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'markdown-it', 'highlight.js'],
      exclude: ['acorn'],
    },
    build: {
      target: 'es2015',
      reportCompressedSize: false,
      sourcemap: !isBuild,
      minify: isBuild ? 'esbuild' : false,
      commonjsOptions: {
        ignoreTryCatch: false,
      },
      outDir: 'dist',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // 根据文件类型分类存放
          assetFileNames: assetInfo => {
            const fileName = assetInfo.name || ''

            // 图片文件
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(fileName)) {
              return `images/[name]-[hash][extname]`
            }
            // 字体文件
            if (/\.(woff2?|eot|ttf|otf)$/i.test(fileName)) {
              return `fonts/[name]-[hash][extname]`
            }
            // CSS文件
            if (/\.css$/i.test(fileName)) {
              return `css/[name]-[hash][extname]`
            }
            // 其他文件
            return `assets/[name]-[hash][extname]`
          },
          // JS文件分类
          chunkFileNames: 'js/[name]-[hash].js',
          entryFileNames: 'js/[name]-[hash].js',
          manualChunks: {
            // 核心框架
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            // 工具库
            'utils-vendor': ['@vueuse/core', '@vueuse/integrations'],
            // 编辑器相关
            'editor-vendor': ['codemirror', 'markdown-it', 'highlight.js'],
            // UI组件库
            'ui-vendor': ['@icon-park/vue-next'],
            // 图表和可视化
            'chart-vendor': ['mermaid', 'markmap-lib', 'markmap-view', 'markmap-common'],
          },
        },
      },
    },
    esbuild: {
      drop: isBuild ? ['console', 'debugger'] : [],
    },
  }
})
