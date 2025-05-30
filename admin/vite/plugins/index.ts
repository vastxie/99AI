import vueLegacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import type { PluginOption } from 'vite'
import appInfo from './app-info'

import createArchiver from './archiver'
import createAutoImport from './auto-import'
import createBanner from './banner'
import createComponents from './components'
import createCompression from './compression'
import createConsole from './console'
import createDevtools from './devtools'
import createLayouts from './layouts'
import createMinify from './minify'
import createMock from './mock'
import createPages from './pages'
import createSvgIcon from './svg-icon'
import createUnocss from './unocss'

export default function createVitePlugins(viteEnv, isBuild = false) {
  const vitePlugins: (PluginOption | PluginOption[])[] = [
    appInfo(),
    vue(),
    vueJsx(),
    vueLegacy({
      renderLegacyChunks: false,
      modernPolyfills: [
        'es.array.at',
        'es.array.find-last',
      ],
    }),
  ]
  vitePlugins.push(createDevtools(viteEnv))
  vitePlugins.push(createAutoImport())
  vitePlugins.push(createComponents())
  vitePlugins.push(createUnocss())
  vitePlugins.push(createSvgIcon(isBuild))
  vitePlugins.push(createMock(viteEnv, isBuild))
  vitePlugins.push(createLayouts())
  vitePlugins.push(createPages())
  vitePlugins.push(...createCompression(viteEnv, isBuild))
  vitePlugins.push(createArchiver(viteEnv))
  vitePlugins.push(createConsole())
  vitePlugins.push(createBanner())
  if (isBuild) {
    vitePlugins.push(createMinify())
  }
  return vitePlugins
}
