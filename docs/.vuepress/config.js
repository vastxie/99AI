import { defaultTheme } from '@vuepress/theme-default'
import { defineUserConfig } from 'vuepress/cli'
import { viteBundler } from '@vuepress/bundler-vite'

export default defineUserConfig({
  lang: 'zh-CN',

  title: '99AI 文档',
  description: '99AI 文档：涵盖介绍、部署、配置等',

  head: [
    ['link', { rel: 'icon', href: '/images/99AI.ico' }] // 指定favicon的路径
  ],

  theme: defaultTheme({
    logo: '/images/99AI.ico',

    navbar: [
      { text: '主页', link: '/' },
      { text: '项目部署', link: '/deployment/deployment' },
      { text: '后台管理', link: '/admin-configuration/admin-configuration' },
      { text: '更新日志', link: '/changelog/development-version-changelog' },
      { text: '常见问题', link: '/faq/' },
    ],

    sidebar: {
      '/deployment/': [
        {
          title: '项目部署',
          collapsible: false,
          children: [
            '/deployment/deployment',
            '/deployment/faq',
          ]
        },
      ],
      '/admin-configuration/': [
        {
          title: '后台配置',
          sidebarDepth: 2,
          children: [
            '/admin-configuration/admin-configuration',
            '/admin-configuration/system-administration',
            '/admin-configuration/user-management',
            '/admin-configuration/model-management',
            '/admin-configuration/data-management',
            '/admin-configuration/application-management',
            '/admin-configuration/storage-configuration',
            '/admin-configuration/payment-management',
            '/admin-configuration/package-management',
            '/admin-configuration/distribution-management',
            '/admin-configuration/ban-control-management',
          ]
        },
      ],
      '/changelog/': [
        {
          title: '更新日志',
          collapsible: false,
          children: [
            '/changelog/development-version-changelog',
            '/changelog/stable-version-changelog',
          ]
        },
      ]
    },

    repo: 'https://github.com/vastxie/99AI',
    docsBranch: 'docs',
    docsDir: 'docs',

    // repoLabel: '仓库地址',

    editLinkText: '编辑此页',
    contributorsText: '贡献者列表',
    backToHome: '返回首页',
    prev: '上一页',
    next: '下一页',
  }),



  bundler: viteBundler(),
})
