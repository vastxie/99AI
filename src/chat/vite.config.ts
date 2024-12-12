import vue from '@vitejs/plugin-vue';
import path from 'path';
import type { PluginOption } from 'vite';
import { defineConfig, loadEnv } from 'vite';
// import compression from 'vite-plugin-compression';
// import { VitePWA } from 'vite-plugin-pwa';

function setupPlugins(env: ImportMetaEnv): PluginOption[] {
  const plugins: PluginOption[] = [vue()];

  // plugins.push(
  //   VitePWA({
  //     injectRegister: 'auto',
  //     manifest: {
  //       name: 'AI Web',
  //       short_name: 'AI Web',
  //       theme_color: '#ffffff',
  //       background_color: '#ffffff',
  //       display: 'standalone',
  //       orientation: 'portrait',
  //       start_url: '/',
  //       icons: [],
  //     },
  //   }) as PluginOption
  // );

  // 使用 Brotli 压缩
  // plugins.push(compression({ algorithm: 'brotliCompress' }) as PluginOption);

  return plugins;
}

export default defineConfig(({ mode }) => {
  const viteEnv = loadEnv(mode, process.cwd()) as unknown as ImportMetaEnv;

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    plugins: setupPlugins(viteEnv),
    server: {
      host: '0.0.0.0',
      port: 9002,
      open: false,
      proxy: {
        '/api': {
          target: viteEnv.VITE_APP_API_BASE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/api/'),
        },
      },
    },
    optimizeDeps: {
      include: ['vue', 'vue-router'],
      exclude: ['acorn'],
    },
    build: {
      reportCompressedSize: false,
      sourcemap: false,
      commonjsOptions: {
        ignoreTryCatch: false,
      },
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue'],
            'naive-ui': ['naive-ui'],
            'vueuse-motion': ['@vueuse/motion'],
            'v-viewer': ['v-viewer'],
          },
        },
      },
    },
  };
});
