import vue from '@vitejs/plugin-vue'
import type { PluginOption } from 'vite'

export function createVitePlugins(isBuild: boolean) {
    const vitePlugins: PluginOption[] = [
        vue(),
    ]

    return vitePlugins
} 