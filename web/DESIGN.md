# Web 用户端 UI 设计契约

## 职责边界

本文档是 Web 用户端唯一的 UI 设计系统契约入口，适用于 `web/` 下用户端页面、用户端通用 UI 组件、主题 token、全局组件样式和设计回归预览。

本文档不负责：

- Server、Admin、沙箱镜像或 WeChat Forward 的设计规则。
- 支付金额、套餐权益、权限判断、登录鉴权、文件访问、API、数据库、部署和许可证规则。
- 贡献流程与提交规范；以根目录 `CONTRIBUTING.md` 为准。

根目录不新增 `DESIGN.md`。原因是本契约只约束 Web 用户端 UI；放在 `web/DESIGN.md` 能避免与后端、Admin、沙箱或贡献规范混淆。

## 基本原则

- 语义优先：组件表达职责和状态，主题文件负责视觉个性，不在业务组件中按主题 id 写分支。
- Token 优先：颜色、字体、间距、圆角、阴影、焦点、层级和动效优先通过语义变量、Tailwind 映射或全局组件 class 承载。
- 自底向上：先改 token 和全局样式，再改基础组件，最后才动页面结构；不在业务组件里绕过基础组件另写一套样式。
- 真实路径优先：空态、输入、发送、等待、停止、消息阅读、菜单、设置、登录、套餐、文件预览、代码工作台这些真实路径的各种状态都要有明确的样式，不只照顾理想情况。
- 可访问性内建：控件必须有可理解名称、键盘路径、可见焦点、状态语义和关闭 / 返回路径。
- 敏感业务不越界：登录、套餐、会员、文件和代码预览只允许改 UI 呈现和语义，不改变业务判断、接口调用、store 字段语义或安全边界。

## Token 与样式分层

Token 分三层，上层只引用下层：

1. 调色板：`web/src/styles/themes/light.css` 与 `dark.css` 静态定义明暗两套取值（`web/src/utils/themeMode.ts` 只切换 `<html>` 上的 `.dark`）。
2. 语义与几何：`web/src/styles/tokens.css` 从调色板派生语义变量，并定义圆角、字号、动效（`--motion-*`）；层级档位在 `styles/z-index.css`。
   - `--app-*`：页面画布、surface、边框、分割线、遮罩。
   - `--text-*`：正文、次级、弱化、反色、链接。
   - `--semantic-*`、`--control-*`、`--interaction-*`：状态色、控件前景与悬停 / 按下底色。
   - `--chat-*`、`--agent-*`、`--panel-*`、`--code-*`：消息、Agent 活动、右侧面板与代码。
   - `--radius-*`、`--type-*`、`--z-*`、`--motion-*`：几何、排版、层级与动效。
3. 组件别名：`--btn-*`、`--menu-*`、`--dialog-*`、`--input-*`、`--tooltip-*` 等，只被对应的组件配方引用。没有地方引用的 token 直接删掉，不为「以后可能用到」预留。

样式文件：

- `web/src/styles/index.css` 统一引入全部全局样式（`main.ts` 只引入它），引入顺序就是层叠顺序。元素级默认（`base.css`，以及 `global.css` 里 html / body / 焦点的规则）放在 Tailwind 的 base 层，排在 preflight 之后，不会被它覆盖。
- 唯一的例外是 `web/src/styles/chat-page.css`：只有会话页用（代码工作台、底部面板的过渡、轮次导航），由 `chatBase.vue` 随会话页的懒加载块引入，层叠位置在 Tailwind 工具类之后；里面的规则只写这些页面级的类，不与工具类争同一元素的同一属性。
- `web/src/styles/recipes.css`（Tailwind 的 components 层）：按钮、图标按钮、输入、提示气泡、菜单、面板、代码块、设置卡片、头像等组件配方，只在这里定义一次（设计守卫 `recipe-single-source`）。components 层的类按模板里用到的输出。
- `web/src/styles/components.css`：跨组件复用的语义 class、复杂状态与上下文修饰（如 `.settings-dialog-panel .settings-card`）、弹窗 / 设置 / 菜单 / 面板 / Markdown 收容层。
- `web/src/styles/motion.css`：各组件的过渡与减弱动效覆盖集中在这里。
- `web/tailwind.config.js` 只把 token 映射成工具类（颜色、层级档位、字体、圆角、阴影、过渡时长），不用插件登记组件。

全局 token 总是有值，引用时不写兜底值（设计守卫 `token-fallback`）；组件里按元素设置的局部变量可以写兜底。

动效刻度只有一套（`tokens.css` 的 `--motion-*`，Tailwind 的 `duration-*` 类映射到同一套，没有数字档）：

| token / 类                               | 时长  | 用在                                                               |
| ---------------------------------------- | ----- | ------------------------------------------------------------------ |
| `--motion-duration-xs` / `duration-xs`   | 100ms | 按下、悬停的反馈                                                   |
| `--motion-duration-sm` / `duration-sm`   | 150ms | 小元素的出现、消失与淡入淡出；不写时长的 `transition-*` 类默认用它 |
| `--motion-duration-md` / `duration-md`   | 200ms | 一般的状态切换                                                     |
| `--motion-duration-lg` / `duration-lg`   | 250ms | 弹窗、消息入场、滑动指示                                           |
| `--motion-duration-xl` / `duration-xl`   | 300ms | 抽屉与较大的位移                                                   |
| `--motion-duration-2xl` / `duration-2xl` | 450ms | 侧边面板的展开收起                                                 |

缓动默认 `--motion-easing`（`cubic-bezier(0.22, 1, 0.36, 1)`），简单的淡入淡出可以写 `ease` / `linear`。过渡与 400ms 以内的动画不写时长字面量；循环、装饰性的长动画（转圈、闪光、波浪）不受限。带位移、尺寸变化的过渡和动画都要有 `@media (prefers-reduced-motion: reduce)` 覆盖，组件内 `<style scoped>` 也一样。

其余几何与表面：

- 圆角：`--radius-sm / (默认) / md / lg / xl / 2xl / 3xl / full` 与 Tailwind 的 `rounded-*` 同名同值（`rounded-*` 映射到它们）；组件用语义圆角 `--radius-control-sm`、`--radius-control`、`--radius-card`、`--radius-popover`、`--radius-dialog`（弹窗外壳与消息气泡这类大面，比卡片再圆一档）、`--radius-pill`。嵌套的外圈圆角写成 `calc(内圈圆角 + 内边距)`；刻度外的圆角由设计守卫 `radius-scale` 拦下。
- 阴影跟随主题：`shadow-sm` / `shadow` 是 `--component-shadow-sm`，`shadow-md` / `shadow-lg` 是浮层的 `--component-shadow-md`，`shadow-xl` / `shadow-2xl` 是弹窗外壳的 `--dialog-shell-shadow`。用 `dialog-surface`（`UiDialog`）的弹窗自带外壳阴影与圆角，不再叠加 `shadow-*`、`rounded-*`。
- 强调色：页面与组件用 `--accent`（Tailwind 的 `accent`）、`--text-link`、`--input-border-focus` 等语义 token，不直接用主色阶 `primary-*`（设计守卫 `accent-token`）；主色阶只在明暗主题与 `tokens.css` 派生语义色时用，语义里缺的在那里补一个（如 `--message-highlight-bg`、`--composer-emphasis-border`）。`tokens.css` 里主色阶的首帧取值等于默认强调色（蓝）启动后写入的色阶（`utils/accentColor.spec.ts` 守住）。
- 选中底色：侧栏会话、分段控件、菜单与弹窗里的选中行共用调色板里的 `--interaction-bg-selected`（与 `--interaction-bg-hover` / `-active` 同一族），组件别名指向它。
- 遮罩：盖住整页的遮罩（弹窗、手机侧栏抽屉、底部面板）只有 `--scrim-bg` 加 `--scrim-blur`；确认框更淡、图片预览更深的两档从 `--app-overlay` 派生；缩略图上的半透明底是 `--media-scrim-bg`。
- 滚动条：只有 `.custom-scrollbar` 一套，颜色在明暗主题的 `--scrollbar-thumb*`；弹层菜单不预留槽位（`recipes.css` 的 `.menu-items.custom-scrollbar`）。组件里不再各写一套。Chromium（121 起）与 Firefox 按标准属性画细滚动条、悬停加深；`::-webkit-scrollbar` 那组（悬停加宽、隐藏横向滚动条、菜单 4px）只在 Safari 生效。
- 字体：`--font-body` 与 `--font-mono`（Tailwind 的 `font-sans` / `font-mono` 指向它们），代码、终端输出、行号都用 `--font-mono`。
- 标题：弹窗（含设置页页头、登录里的找回 / 重设密码步骤）的标题统一 `.type-dialog-title`。
- 加载：转圈统一 `UiSpinner`（扩展包里也用它），加载更早消息的三点跳动是唯一的点阵指示。
- Markdown：消息正文用 `.md-prose` 与 `chat-markdown` 修饰；后台配置的公告 / 协议用 `SafeMarkdownPreview` 自带的紧凑文档排版（次级文字色、标题更小），是有意区分的一套，不往 `.md-prose` 合并。

样式只用 CSS：token、Tailwind 与 `styles/` 下的语义 class，组件内 `<style>` 也写普通 CSS，不引入 less / scss 等预处理器（设计守卫 `plain-css-only` 规则）。

Vue 组件负责结构、状态、事件、slot、ARIA 和业务调用点，不应承载新的主题色体系。

## 字体与排版

- 页面标题、弹窗标题、区块标题、字段标题、正文、控件、动作文本和说明文本优先使用既有 `type-*` class。
- 字号只用 `--type-*-size` 刻度：12px 说明（`caption`）、13px 次要说明（`meta`：代码块语言名、引用块、文件名、回合导航、代码编辑器）、14px 控件与次要正文（`control`、`body-sm`）、16px 正文与字段标题（`body`、`field-title`，输入框也用正文字号）、18px 区块与弹窗标题（`section-title`、`dialog-title`）；展示字号 22 / 26px（`display-sm`、`display`）只给首页欢迎语与公告、协议正文的一级标题。模板里对应 `text-xs` / `text-sm` / `text-base` / `text-lg`。正文排版里相对父级的比例（Markdown 标题、行内代码）写 em。刻度外的字号由设计守卫 `type-scale` 拦下，确属例外时在该行写 `design-guard-allow` 与理由。
- 不使用 viewport width 缩放字体。
- 字距保持 0；除非品牌字标有明确理由并经审计。
- 紧凑面板、按钮、菜单、表单和状态卡片使用适配容器的字号，不使用 hero 级字号。

## 颜色与主题

- 新增颜色前先判断是否能归入 app、text、chat、agent、panel、code、semantic、component、interaction、dialog、menu 或 input。
- 组件不得读取或判断具体主题 id。
- 对比度不足时优先调整 token，不在单个业务组件里打一次性颜色补丁。
- 明暗模式必须通过语义变量自然切换，禁止只在浅色模式验证。

## 间距、圆角、阴影与层级

- 页面级布局定义 shell gap，组件内部使用 compact、normal、spacious 三档节奏。
- 图标按钮、输入、菜单项、弹窗、面板、卡片分别使用语义圆角，不把 pill 作为默认容器形态。
- 阴影消费 `--component-shadow-*`、菜单 / 弹窗专用 token 或已有全局 class。
- z-index 使用 `styles/z-index.css` 的语义档位（Tailwind 的 `z-*` 语义类映射到同一组变量，如 `z-header`、`z-content`、`z-composer`、`z-sidebar`、`z-workspace`），不散落魔法数字；组件自己的层叠上下文里的局部堆叠用 `z-1` / `z-2`（CSS 里写小于 10 的整数），不用 Tailwind 的 `z-10` 到 `z-50` 数字档。
- Dialog、menu、image viewer、confirm、global message、代码工作台浮层的层级必须单独验收。

## 基础组件契约

Button：

- 使用原生 `button type="button"` 或明确的 submit 语义。
- 支持 primary、secondary、ghost、danger 语义，以及下拉触发器用的 select 形态。
- 状态覆盖 normal、hover、active、focus-visible、disabled、loading、selected / pressed。
- loading 保留可访问名称，可用 `aria-busy` 表达忙碌状态。

IconButton / ActionIcon / Tooltip：

- 纯图标按钮用 `UiButton icon` 或 `web/src/components/common/ActionIcon/`，文字提示用 `UiTooltip` 包住控件（ActionIcon 自带 `tooltip`）；不手写 `.tooltip` 元素。
- `label` 或 `tooltip` 至少提供一个可理解名称；提示对读屏隐藏，名称由控件的 `aria-label` 给出。
- 提示悬停稍等再出现、键盘聚焦立即出现；指针点过之后到指针离开或焦点移走之前不再出现，键盘触发的点击不隐藏；触屏不显示。有自绘提示时不再给原生 `title`。
- 提示方位类（`tooltip-top` 等）写成字面量映射（`components/common/tooltip.ts`）：`@layer` 里的类拼接出来会在生产构建里被清掉（设计守卫 layered-class-literal）。
- 支持 disabled、loading、active、danger 和 trigger attrs。
- 不在调用点手写无 label 的纯图标 button。

Dropdown / Menu：

- 优先使用 `web/src/components/common/DropdownMenu/`。
- trigger 需要 `aria-haspopup="menu"`、`aria-expanded`、`aria-controls`。
- menu item 支持键盘操作、disabled、selected、danger 和关闭策略。
- Teleport 菜单必须验证定位、滚动和视口边界。

Tabs：

- `tablist`、`tab`、`tabpanel`、`aria-selected`、`aria-controls`、`aria-labelledby` 成套出现。
- 横向 Tabs 支持左右键，纵向 Tabs 支持上下键；Home / End 推荐支持。
- 选中态不能只靠颜色。

Dialog / Sheet：

- 弹窗壳使用统一 surface、overlay、title、description、close button。居中弹窗用 `components/common/UiDialog.vue`：过渡、遮罩、层级、面板与 `useDialogA11y` 在一处，调用方只写内容和关闭逻辑；登录、确认框、套餐购买的外壳结构不同，仍各自实现。
- 标题关联完整，Esc、遮罩点击、关闭按钮和提交成功后的焦点返回需要验收。
- 移动端底部 Sheet 与桌面居中 Dialog 可分实现，但 token、状态和关闭语义一致。

Form：

- label、helper、error、required、disabled、readonly、loading 统一。
- 错误必须有文本说明，不只靠红色。
- 提交中防重复点击，同时保留状态提示。
- 不改变接口字段、store 字段和业务保存语义。

State：

- 统一覆盖 empty、loading、streaming、success、warning、error、offline / reconnecting、disabled、readonly、selected、expanded、collapsed。
- 消息流、工具调用、媒体生成、文件列表、会员权益、设置保存都需要状态样例。
- loading / busy 状态需考虑屏幕阅读器播报。

## 页面结构契约

- `web/src/views/chat/chat.vue` 管登录、公告、设置，以及扩展包登记的全局弹窗（签到、套餐等）。
- `web/src/views/chat/chatBase.vue` 管消息画布、输入 dock、右侧面板、移动 Sheet、滚动行为和主流程布局。
- Header / Sider / Footer 使用明确 surface class。
- Message 目录只改消息壳、间距、操作控件和状态呈现，不改消息协议或 Agent 事件投影。
- UnifiedSidePanel 与代码工作台只改 UI shell、层级、响应式和状态表达，不改文件鉴权、代码执行、套餐权益或购买逻辑。

## 响应式契约

关键宽度：

- 320px
- 375px
- 768px
- 1024px
- 1440px

断点与触控：

- 移动布局只有一个断点：宽度 < 768px。JS 用 `hooks/useViewport` 的 `isMobile`，CSS 用 Tailwind 的 `md:` 前缀、`(max-width: 767.9px)` 或 `(min-width: 768px)`，不另设 640 / 720 等宽度（设计守卫 `single-breakpoint`；按内容疏密分档的个别例外在该行登记理由）。
- 触控热区（按钮、分段控件、菜单行至少 `--control-touch-size`）按 `(pointer: coarse)` 判断，不按宽度：平板也有大热区，窄窗口里用鼠标不变大。
- 安全区只经 `--safe-top / --safe-right / --safe-bottom / --safe-left` 读（设计守卫 `safe-area-token`），并且只在贴着屏幕边缘的那一层让出：输入区由 `.ds-input-dock` 让出底部，对话栏左右留白 `.chat-content-inset` 在横屏刘海屏上不小于左右安全区。

要求：

- 移动端保证输入、发送、停止、菜单、设置、文件、会员和预览可操作。
- 桌面端保证右侧面板、代码工作台和主聊天流互不遮挡。
- 底部输入 dock 需要处理安全区。
- 不通过 viewport 字号缩放解决拥挤问题。
- 文本不得互相覆盖，长词、长 URL、长中文和代码块需要可换行或可滚动。

## 设计回归

- `pnpm check:design`（`web/scripts/check-design-guidelines.mjs`，CI 同款）只扫源码就能保证的不变量：颜色只来自 token、动效时长与缓动只用 `--motion-*` 刻度（`motion-duration-token`、`motion-easing-token`）、带位移的动效要有「减弱动态效果」覆盖（`styles/` 与组件样式都查）、断点只有 768（`single-breakpoint`）、安全区只用 `--safe-*`（`safe-area-token`）、模板 class 里的颜色 / 描边类工具类必须是 Tailwind 能生成的（`unknown-utility`：颜色键指向 CSS 变量，不支持 `/80` 这类透明度后缀）、层级只用 z-index token、字号与圆角只用刻度（`type-scale`、`radius-scale`）、只有一套明暗主题机制、样式只用 CSS；组件样式写在 `<style scoped>` 里（确需全局的放进 `styles/` 并加组件前缀），`:global(...)` 后面不接其他选择器，不在样式里重定义 Tailwind 工具类（如 `.hidden`、`.transform`）；组件配方只在 `styles/recipes.css` 定义一次，`tailwind.config.js` 不用插件登记组件。
- 基础组件与关键页面的样式测试（`*.spec.ts`）直接断言计算后的样式，例如按钮尺寸、焦点描边、过渡时长与曲线；`styles/layering.spec.ts` 按 `index.css` 的顺序连同 Tailwind 的 base 层一起编译，守住层序。改动这些样式时同步更新断言，并说明视觉上的变化。
- 明暗模式、移动端与桌面端、长文本与代码块、弹窗与菜单等视觉效果，最终以真实浏览器里的检查为准。

## 禁止项

- UI 改动不改变支付、权限、API、数据库、部署、许可证、文件访问、iframe sandbox、代码执行或沙箱语义。
- 不把临时视觉偏好写成全局规则。
- 不在多个 DESIGN 文件重复维护同一套 Web 用户端 UI 契约。
