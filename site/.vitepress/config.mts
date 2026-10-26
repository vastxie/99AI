import { defineConfig } from "vitepress";

const guideSidebar = [
  {
    text: "指南",
    items: [
      { text: "项目介绍", link: "/" },
      { text: "内核与扩展包", link: "/guide/" },
      { text: "用户端功能", link: "/guide/user" },
      { text: "管理端功能", link: "/guide/admin" },
      { text: "二次开发", link: "/guide/development" },
    ],
  },
];

const deploymentSidebar = [
  {
    text: "安装部署",
    items: [
      { text: "部署指南", link: "/deployment/" },
      { text: "扩展包开关与裁剪", link: "/deployment/packs" },
      { text: "外部接入", link: "/deployment/integrations" },
      { text: "常见问题", link: "/deployment/faq" },
    ],
  },
];

const configurationSidebar = [
  {
    text: "后台配置",
    items: [
      { text: "配置概述", link: "/configuration/" },
      {
        text: "平台设置",
        link: "/configuration/platform/",
        collapsed: false,
        items: [
          { text: "基础信息", link: "/configuration/platform/base-configuration" },
          { text: "界面外观", link: "/configuration/platform/display-settings" },
          { text: "公告协议", link: "/configuration/platform/announcement-settings" },
          { text: "文件存储", link: "/configuration/platform/storage-config" },
        ],
      },
      {
        text: "AI 能力",
        link: "/configuration/ai/",
        collapsed: false,
        items: [
          { text: "模型管理", link: "/configuration/ai/model-settings" },
          { text: "MCP 服务", link: "/configuration/ai/mcp" },
          { text: "全局配置", link: "/configuration/ai/advanced-config" },
          { text: "私有文件", link: "/configuration/ai/private-file-management" },
        ],
      },
      {
        text: "用户运营",
        link: "/configuration/users/",
        collapsed: false,
        items: [
          { text: "用户管理", link: "/configuration/users/user-info" },
          { text: "对话记录", link: "/configuration/users/chat-records" },
          { text: "用户策略", link: "/configuration/users/user-settings" },
          { text: "账户明细 · 商业包", link: "/configuration/users/account-details" },
        ],
      },
      {
        text: "登录接入",
        link: "/configuration/access/",
        collapsed: false,
        items: [
          {
            text: "登录配置",
            link: "/configuration/access/login-config",
            collapsed: false,
            items: [
              { text: "邮箱登录 · 邮箱包", link: "/configuration/access/email-config" },
              { text: "手机号登录 · 手机号包", link: "/configuration/access/sms-config" },
            ],
          },
          {
            text: "微信配置 · 微信包",
            link: "/configuration/access/wechat-config",
            collapsed: false,
            items: [
              { text: "微信登录配置", link: "/configuration/access/wechat-login-config" },
              { text: "公众号菜单", link: "/configuration/access/wechat-menu-config" },
            ],
          },
          { text: "Bot 通道 · 微信包", link: "/configuration/access/bot-channel" },
        ],
      },
      {
        text: "支付财务 · 商业包",
        link: "/configuration/payment/",
        collapsed: false,
        items: [
          { text: "套餐设置", link: "/configuration/payment/package-settings" },
          { text: "沙箱资源", link: "/configuration/payment/sandbox-resources" },
          { text: "订单管理", link: "/configuration/payment/order-list" },
          { text: "支付配置", link: "/configuration/payment/payment-config" },
          { text: "支付参数", link: "/configuration/payment/channel-config" },
        ],
      },
      {
        text: "安全风控 · 内容安全包",
        link: "/configuration/security/",
        collapsed: false,
        items: [
          { text: "内容审核", link: "/configuration/security/sensitive-words" },
          { text: "白名单", link: "/configuration/security/whitelist" },
          { text: "违规记录", link: "/configuration/security/violation-records" },
        ],
      },
    ],
  },
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "99Agent 文档",
  description: "可私有化部署的多用户 AI Agent 基座：最小内核加可删除的扩展包，覆盖部署、后台配置与二次开发",
  srcExclude: ["写作规范.md"],
  sitemap: {
    hostname: "https://docs.lightai.cloud",
  },

  vite: {
    server: {
      port: 9005,
    },
  },
  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    [
      "meta",
      {
        name: "keywords",
        content: "99Agent, AI Agent, 私有化部署, 多用户, 沙箱, MCP, 扩展包, Node.js, Vue, NestJS",
      },
    ],
    ["meta", { name: "viewport", content: "width=device-width, initial-scale=1.0" }],
    ["meta", { property: "og:title", content: "99Agent 文档" }],
    [
      "meta",
      {
        property: "og:description",
        content: "可私有化部署的多用户 AI Agent 基座：最小内核加可删除的扩展包，覆盖部署、后台配置与二次开发",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { name: "robots", content: "index,follow" }],
  ],
  lang: "zh-CN",
  ignoreDeadLinks: false,
  locales: {
    root: {
      label: "简体中文",
      lang: "zh-CN",
    },
  },

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/favicon.ico",

    nav: [
      { text: "指南", link: "/", activeMatch: "^/(?:$|guide/)" },
      { text: "安装部署", link: "/deployment/", activeMatch: "^/deployment/" },
      { text: "后台配置", link: "/configuration/", activeMatch: "^/configuration/" },
      { text: "更新日志", link: "/changelog", activeMatch: "^/changelog" },
    ],

    sidebar: {
      "/guide/": guideSidebar,
      "/deployment/": deploymentSidebar,
      "/configuration/": configurationSidebar,
      "/": guideSidebar,
    },

    outline: {
      label: "页面导航",
    },

    docFooter: {
      prev: "上一页",
      next: "下一页",
    },

    returnToTopLabel: "返回顶部",
    sidebarMenuLabel: "菜单",
    darkModeSwitchLabel: "主题",
    lightModeSwitchTitle: "切换到浅色模式",
    darkModeSwitchTitle: "切换到深色模式",

    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "搜索", buttonAriaLabel: "搜索" },
          modal: {
            noResultsText: "没有找到相关内容",
            resetButtonTitle: "清除",
            footer: { selectText: "选择", navigateText: "切换", closeText: "关闭" },
          },
        },
      },
    },
  },
});
