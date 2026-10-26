# 富媒体渲染包（rich-media）

思维导图 / Mermaid 消息、HTML / Mermaid / MarkMap 预览、CodeMirror 代码面板、PDF / Office 文件预览；只有用户端，没有服务端部分。

## 开关

- 用户端：`VITE_RICH_MEDIA_ENABLED`（只有取值恰为 false 时关闭）

## 贡献

- 消息渲染器 `mind-map` / `mermaid`、预览渲染器 `html` / `svg` / `mermaid` / `markmap`、右侧面板 `code` / `file`、mermaid 代码高亮、自己的语言片段

## 删除影响

删掉后消息按普通文本渲染，预览面板只显示只读源码，代码面板退化为只读高亮，文件面板退化为下载入口；mermaid / markmap / codemirror / pdfjs 等依赖随本目录的 `package.json` 一起消失，不再进入构建产物。

## 依赖

本包的运行时依赖写在本目录的 `package.json`（pnpm workspace 子包），在 `web/` 执行 `pnpm install` 时一并安装；删包后再 `pnpm install` 一次即从锁文件与 node_modules 卸载。pdf.js 的 cmaps / 标准字体 / wasm 解码器 / ICC 配置由 `web/vite.config.mts` 的运行时资源插件从本目录的 `node_modules/pdfjs-dist` 转发与拷贝，包不存在时插件自动跳过。
