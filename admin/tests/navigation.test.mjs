import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

// 扩展包注册表靠 import.meta.glob 发现各包，Node 里换成空实现，只检查内核分组
register('./helpers/module-hooks.mjs', {
  parentURL: import.meta.url,
  data: {
    stubs: {
      '@/packs': 'export const packNavGroups = () => []; export const packNavPages = () => [];',
    },
  },
});

const {
  activeNavPath,
  buildBreadcrumbs,
  buildNavGroups,
  buildSearchEntries,
  joinPath,
  searchEntries,
} = await import('../src/router/navigation.ts');
const { groupRoutes } = await import('../src/router/groups/index.ts');
const { default: paymentGroup } = await import('../src/packs/commerce/nav-group.ts');
const { default: securityGroup } = await import('../src/packs/content-safety/nav-group.ts');

const allowAll = () => true;
const asRole = (role) => (roles) => !roles?.length || roles.includes(role);

const sampleGroups = [
  {
    path: '/ai',
    meta: { title: 'AI 能力', icon: 'i-lucide:sparkles' },
    children: [
      { path: 'keys', meta: { title: '模型管理', icon: 'i-lucide:brain-circuit' } },
      { path: 'mcp', meta: { title: 'MCP 服务', roles: ['super'] } },
      { path: 'detail/:id', meta: { title: '详情', hidden: true, activeNav: '/ai/keys' } },
      { path: 'untitled', meta: {} },
    ],
  },
  {
    path: '/secret',
    meta: { title: '只给超管', roles: ['super'] },
    children: [{ path: 'a', meta: { title: 'A' } }],
  },
  {
    path: '/empty',
    meta: { title: '空分组' },
    children: [{ path: 'x', meta: { title: 'X', hidden: true } }],
  },
];

test('joinPath：绝对路径原样返回，相对路径拼在分组后，空路径就是分组本身', () => {
  assert.equal(joinPath('/ai', 'keys'), '/ai/keys');
  assert.equal(joinPath('/ai/', 'keys'), '/ai/keys');
  assert.equal(joinPath('/ai', '/other'), '/other');
  assert.equal(joinPath('/ai', ''), '/ai');
  assert.equal(joinPath('/', 'setting'), '/setting');
  assert.equal(joinPath('/', ''), '/');
});

test('buildNavGroups：隐藏、无标题、无权访问的页面不列出，没有可见页面的分组整组不出现', () => {
  assert.deepEqual(buildNavGroups(sampleGroups, asRole('super')), [
    {
      path: '/ai',
      title: 'AI 能力',
      icon: 'i-lucide:sparkles',
      links: [
        { path: '/ai/keys', title: '模型管理', icon: 'i-lucide:brain-circuit' },
        { path: '/ai/mcp', title: 'MCP 服务', icon: undefined },
      ],
    },
    {
      path: '/secret',
      title: '只给超管',
      icon: undefined,
      links: [{ path: '/secret/a', title: 'A', icon: undefined }],
    },
  ]);
  const forAdmin = buildNavGroups(sampleGroups, asRole('admin'));
  assert.deepEqual(
    forAdmin.map((group) => [group.path, group.links.map((link) => link.path)]),
    [['/ai', ['/ai/keys']]],
  );
});

test('activeNavPath：隐藏页面借用 activeNav 指向的侧栏条目', () => {
  assert.equal(
    activeNavPath({ path: '/ai/detail/3', meta: { activeNav: '/ai/keys' } }),
    '/ai/keys',
  );
  assert.equal(activeNavPath({ path: '/ai/keys', meta: {} }), '/ai/keys');
});

test('buildBreadcrumbs：首页打头，跳过无标题的外壳与首页自身，最后一级不带链接', () => {
  const home = { path: '/', title: '主页' };
  const shell = { path: '/', meta: {} };
  assert.deepEqual(buildBreadcrumbs([shell, { path: '/', meta: { title: '主页' } }], home), [
    { title: '主页' },
  ]);
  assert.deepEqual(
    buildBreadcrumbs(
      [
        shell,
        { path: '/ai', meta: { title: 'AI 能力' } },
        { path: '/ai/keys', meta: { title: '模型管理' } },
      ],
      home,
    ),
    [{ title: '主页', path: '/' }, { title: 'AI 能力', path: '/ai' }, { title: '模型管理' }],
  );
  assert.deepEqual(
    buildBreadcrumbs([shell, { path: '/setting', meta: { title: '个人设置' } }], home),
    [{ title: '主页', path: '/' }, { title: '个人设置' }],
  );
});

test('页面搜索：页面没有图标时沿用分组图标，按标题 / 路径 / 分组名不区分大小写匹配', () => {
  const entries = buildSearchEntries(buildNavGroups(sampleGroups, allowAll));
  assert.deepEqual(entries[1], {
    path: '/ai/mcp',
    title: 'MCP 服务',
    icon: 'i-lucide:sparkles',
    trail: ['AI 能力', 'MCP 服务'],
  });
  assert.deepEqual(searchEntries(entries, '').length, entries.length);
  assert.deepEqual(
    searchEntries(entries, 'mcp').map((entry) => entry.path),
    ['/ai/mcp'],
  );
  assert.deepEqual(
    searchEntries(entries, '  /SECRET ').map((entry) => entry.path),
    ['/secret/a'],
  );
  assert.deepEqual(
    searchEntries(entries, 'ai 能力').map((entry) => entry.path),
    ['/ai/keys', '/ai/mcp'],
  );
  assert.deepEqual(searchEntries(entries, '不存在'), []);
});

test('页面搜索排序：页面名以关键字开头的最前，其次页面名包含关键字，只有分组名或路径命中的排最后', () => {
  const entry = (title, path, group) => ({ title, path, trail: [group, title] });
  const entries = [
    entry('全局配置', '/ai/advanced', 'AI 能力'),
    entry('接入记录', '/login-log', '登录接入'),
    entry('登录配置', '/channel/login', '登录接入'),
    entry('配置向导', '/setup', '平台设置'),
  ];
  assert.deepEqual(
    searchEntries(entries, '配置').map((item) => item.title),
    ['配置向导', '全局配置', '登录配置'],
  );
  assert.deepEqual(
    searchEntries(entries, '登录').map((item) => item.title),
    ['登录配置', '接入记录'],
  );
});

test('内核与扩展包的侧栏分组：有标题图标，访问分组地址跳到第一个可见页面，隐藏页面的高亮指向本组可见页面', () => {
  const groups = [...groupRoutes, paymentGroup, securityGroup];
  const names = new Set();
  for (const group of groups) {
    assert.ok(group.path.startsWith('/'), group.path);
    assert.ok(group.meta?.title && group.meta?.icon, `${group.path} 缺少标题或图标`);
    assert.equal(group.component, undefined, `${group.path} 分组路由不带组件`);
    const visible = group.children.filter((page) => !page.meta?.hidden);
    assert.equal(group.redirect, joinPath(group.path, visible[0].path), `${group.path} 的跳转`);
    for (const page of group.children) {
      assert.ok(page.name && !names.has(page.name), `路由名重复或缺失：${String(page.name)}`);
      names.add(page.name);
      assert.ok(page.meta?.title, `${page.path} 缺少标题`);
      if (page.meta?.hidden) {
        const target = visible.map((item) => joinPath(group.path, item.path));
        assert.ok(target.includes(page.meta.activeNav), `${page.path} 的 activeNav`);
      }
    }
  }
});
