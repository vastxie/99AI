import type { PluginOption } from 'vite'

/**
 * 配置代码混淆
 * @returns {PluginOption} Vite插件
 */
export default function createMinify(): PluginOption {
    return {
        name: 'vite:minify-config',
        enforce: 'post',
        apply: 'build',
        config(config) {
            // 确保build配置存在
            config.build = config.build || {}

            // 配置Terser混淆选项
            config.build.minify = 'terser'
            config.build.terserOptions = {
                compress: {
                    // 生产环境去除console
                    drop_console: true,
                    drop_debugger: true,
                },
                format: {
                    // 去除注释
                    comments: false,
                },
                mangle: {
                    // 混淆变量名
                    toplevel: true,
                    safari10: true,
                },
                // 混淆类名
                keep_classnames: false,
                // 混淆函数名
                keep_fnames: false,
            }
        }
    }
} 