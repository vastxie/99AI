import { fileURLToPath, URL } from 'node:url';
import legacy from '@vitejs/plugin-legacy';
import vue from '@vitejs/plugin-vue';
import unocss from 'unocss/vite';
import autoImport from 'unplugin-auto-import/vite';
import components from 'unplugin-vue-components/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  // 本地开发可让请求走 /proxy 转发到 VITE_APP_API_BASEURL（见 src/api/index.ts）
  const useProxy = command === 'serve' && env.VITE_OPEN_PROXY === 'true';

  return {
    base: env.VITE_BASE_PATH,
    plugins: [
      vue(),
      // 只产出现代构建，并按目标浏览器补上页面用到的几个较新的数组方法
      legacy({
        renderLegacyChunks: false,
        modernTargets: [
          'chrome >= 105',
          'edge >= 105',
          'firefox >= 106',
          'safari >= 16.4',
          'ios >= 16.4',
        ],
        modernPolyfills: [
          'es.array.at',
          'es.array.find-last',
          'es.array.to-reversed',
          'es.array.to-sorted',
        ],
      }),
      autoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        dirs: ['src/utils/composables/**'],
        dts: 'src/types/auto-imports.d.ts',
      }),
      components({
        dirs: ['src/components'],
        dts: 'src/types/components.d.ts',
      }),
      unocss(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 9000,
      open: false,
      proxy: useProxy
        ? {
            '/proxy': {
              target: env.VITE_APP_API_BASEURL,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/proxy/u, ''),
            },
          }
        : undefined,
    },
    build: {
      sourcemap: env.VITE_BUILD_SOURCEMAP === 'true',
      minify: 'terser',
      terserOptions: {
        compress: { drop_console: true, drop_debugger: true },
        format: { comments: false },
      },
    },
  };
});
