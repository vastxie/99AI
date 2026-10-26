import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  dependencyOwnership,
  kernelReferences,
  moduleSpecifiers,
  ownershipKernelFiles,
  packImports,
} from './pack-sources.mjs';

/** 只构造一端（默认 server）：host 为宿主依赖，kernel 为内核 import，packs 为 { id: [声明, import] } */
function check({ host, kernel = [], packs, app = 'server' }) {
  const manifests = Object.entries(packs).map(([id, [declared]]) => ({
    id,
    apps: { [app]: { dir: '', manifest: { dependencies: declared } } },
  }));
  const usage = new Map([
    [
      app,
      {
        host: new Set(host),
        kernel: new Set(kernel),
        packs: new Map(Object.entries(packs).map(([id, [, imported]]) => [id, new Set(imported)])),
      },
    ],
  ]);
  const result = dependencyOwnership(manifests, usage);
  return {
    owned: [...result.owned.get(app)].sort(),
    problems: Object.fromEntries(result.problems),
    leaks: result.leaks,
  };
}

test('只被声明它的包使用、内核没用的宿主依赖归包所有', () => {
  const result = check({
    host: ['stripe', 'axios'],
    kernel: ['axios'],
    packs: { commerce: [['stripe'], ['stripe', 'axios']] },
  });
  assert.deepEqual(result.owned, ['stripe']);
  assert.deepEqual(result.problems, {});
});

test('声明了内核也在用的依赖：报问题，且不从内核依赖里扣除', () => {
  const result = check({
    host: ['axios'],
    kernel: ['axios'],
    packs: { commerce: [['axios'], ['axios']] },
  });
  assert.deepEqual(result.owned, []);
  assert.deepEqual(result.problems.commerce, ['axios 内核也在用，不能声明为扩展包独占']);
});

test('用到依赖却没声明的包：报问题并列入提示，依赖不归包所有', () => {
  const result = check({
    host: ['qrcode'],
    packs: { wechat: [['qrcode'], ['qrcode']], commerce: [[], ['qrcode']] },
  });
  assert.deepEqual(result.owned, []);
  assert.deepEqual(result.problems.commerce, [
    'server 依赖 qrcode 只有扩展包在用，请在 pack.json 的 dependencies 里声明',
  ]);
  assert.deepEqual(result.leaks, [{ app: 'server', dependency: 'qrcode', packs: ['commerce'] }]);
});

test('声明了却没用到、或宿主里没有的依赖：报问题，不归包所有', () => {
  const result = check({
    host: ['stripe'],
    packs: { commerce: [['stripe', 'alipay-sdk'], []] },
  });
  assert.deepEqual(result.owned, []);
  assert.deepEqual(result.problems.commerce, [
    'dependencies 里的 stripe 没有被包内代码使用',
    'dependencies 里的 alipay-sdk 不在 server/package.json 的 dependencies 中',
  ]);
});

function withFiles(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'pack-sources-'));
  try {
    const paths = Object.entries(files).map(([name, text]) => {
      const path = join(dir, name);
      writeFileSync(path, text);
      return path;
    });
    return run(paths);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('内核侧：原文引号与解析出的字符串都算内核在用（注释、模板、转义写法都不漏）', () => {
  const kernel = withFiles(
    {
      'main.ts': [
        'import /* 注释 */ "reflect-metadata";',
        "import x from /* 注释 */ 'axios';",
        'const m = await import(`ioredis`);',
        "import '\\x73tripe';",
        "// 需要时改用 'nodemailer'",
        "import { y } from '@nestjs/common/z';",
      ].join('\n'),
      'zh.json': '{ "label": "qrcode" }',
    },
    (files) => [...kernelReferences(files)],
  );
  for (const name of [
    '@nestjs/common',
    'axios',
    'ioredis',
    'nodemailer',
    'qrcode',
    'reflect-metadata',
    'stripe',
  ])
    assert.ok(kernel.includes(name), name);
});

test('包侧：只认代码里真正的模块引用', () => {
  const code = [
    "import 'a';",
    "import b from 'b';",
    "export * from 'c';",
    "import d = require('d');",
    'const e = await import(`e`);',
    "jest.mock('f');",
    "jest.requireActual('g');",
    "import type { T } from 'h';",
    "type U = import('i').U;",
    "const re = /[/*]/; import j from 'j';",
    'if (ok) /from "fake1"/.test(value);',
    "let n = 1; n++ / 2; import('k');",
    "// import x from 'fake2'",
    "/* from 'fake3' */",
    'const s = "import x from \'fake4\'";',
    'const t = `${/* from "fake5" */ 1} import x from \'fake6\'`;',
    "obj.require('fake7'); Array.from('fake8');",
    "import l from '\\x6c';",
  ].join('\n');
  assert.deepEqual(moduleSpecifiers(code), [
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
    'h',
    'i',
    'j',
    'k',
    'l',
  ]);
});

test('包侧：.vue 只看去掉 HTML 注释后的 <script>，模板文字与 JSON 不算引用', () => {
  const imports = withFiles(
    {
      'Panel.vue': [
        '<template><p>from "fake9"</p><!-- <script>import "fake10"</script> --></template>',
        '<script setup lang="ts">',
        "import m from 'm'",
        '</script>',
      ].join('\n'),
      'zh.json': '{ "text": "import x from \'fake11\'" }',
    },
    (files) => [...packImports(files)].sort(),
  );
  assert.deepEqual(imports, ['m']);
});

test('包声明内核以副作用导入使用的依赖：报问题，不从内核依赖里扣除', () => {
  const result = check({
    host: ['reflect-metadata'],
    kernel: ['reflect-metadata'],
    packs: { commerce: [['reflect-metadata'], ['reflect-metadata']] },
  });
  assert.deepEqual(result.owned, []);
  assert.deepEqual(result.problems.commerce, ['reflect-metadata 内核也在用，不能声明为扩展包独占']);
});

test('客户端只提示不拦截；客户端包在 pack.json 写 dependencies 是错误', () => {
  const hint = check({ app: 'web', host: ['qrcode'], packs: { commerce: [[], ['qrcode']] } });
  assert.deepEqual(hint.problems, {});
  assert.deepEqual(hint.owned, []);
  assert.deepEqual(hint.leaks, [{ app: 'web', dependency: 'qrcode', packs: ['commerce'] }]);

  const declared = check({
    app: 'web',
    host: ['qrcode'],
    packs: { commerce: [['qrcode'], ['qrcode']] },
  });
  assert.deepEqual(declared.problems.commerce, [
    'web 端的 pack.json 不写 dependencies：客户端包的依赖写在包自己的 package.json',
  ]);
  assert.deepEqual(declared.owned, []);
});

test('服务端内核扫描覆盖 server/ 下全部代码（含 .tsx / .jsx / .d.ts 与脚本），跳过扩展包、依赖、构建产物与根下的运行期目录', () => {
  const root = mkdtempSync(join(tmpdir(), 'ownership-kernel-'));
  try {
    const files = {
      'src/app.tsx': '',
      'src/main.ts': '',
      'scripts/tool.mjs': '',
      'src/types.d.ts': '',
      'src/view.jsx': '',
      'src/packs/commerce/x.ts': '',
      'node_modules/y/index.ts': '',
      'dist/main.js': '',
      // 运行期目录：构建好的前端、私有存储、沙箱工作区、日志
      'public/chat/assets/payment.js': "import('stripe')",
      'storage/private/upload.js': '',
      'data/sandboxes/u1/workspace/script.js': '',
      'logs/rotate.js': '',
      // 只跳过根下这几个目录：同名的子目录、data/ 下的其他代码照常扫
      'data/seed.ts': '',
      'src/public/icon.ts': '',
    };
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(root, name, '..'), { recursive: true });
      writeFileSync(join(root, name), text);
    }
    const found = ownershipKernelFiles(root)
      .map((file) =>
        file
          .slice(root.length + 1)
          .split('\\')
          .join('/'),
      )
      .sort();
    assert.deepEqual(found, [
      'data/seed.ts',
      'scripts/tool.mjs',
      'src/app.tsx',
      'src/main.ts',
      'src/public/icon.ts',
      'src/types.d.ts',
      'src/view.jsx',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('TSX / JSX 按各自语法解析：JSX 文本不算引用，JSX 之后的真实导入照常识别', () => {
  const code = 'const view = <div>import "fake12"</div>;\nimport s from "stripe";\n';
  assert.deepEqual(moduleSpecifiers(code, 'panel.tsx', 'tsx'), ['stripe']);
  assert.deepEqual(moduleSpecifiers(code, 'panel.jsx', 'jsx'), ['stripe']);
  const imports = withFiles({ 'panel.tsx': code }, (files) => [...packImports(files)]);
  assert.deepEqual(imports, ['stripe']);
});

test('内核声明文件里的 import type 同样算内核在用', () => {
  const kernel = withFiles(
    {
      'globals.d.ts': "import type { Stripe } from 'stripe';\ndeclare global { var pay: Stripe }\n",
    },
    (files) => [...kernelReferences(files)],
  );
  assert.ok(kernel.includes('stripe'));
});

test('包侧：按真实绑定识别加载函数——createRequire 的结果、import-dynamic 助手与 resolve 调用', () => {
  const code = [
    "import { createRequire } from 'node:module';",
    "import { importDynamic } from '../shared/import-dynamic';",
    'const runtimeRequire = createRequire(__filename);',
    "runtimeRequire('n');",
    "await importDynamic('o');",
    "require.resolve('p');",
    "import.meta.resolve('q');",
    "other('fake13'); logger.log('fake14');",
  ].join('\n');
  assert.deepEqual(moduleSpecifiers(code), [
    'node:module',
    '../shared/import-dynamic',
    'n',
    'o',
    'p',
    'q',
  ]);
});

test('包侧：同名的无关函数、别的作用域里的变量、被遮蔽的 require 都不算模块引用', () => {
  const code = [
    "import { createRequire } from 'node:module';",
    'function importDynamic(value) { return Promise.resolve(value); }',
    "importDynamic('fake15');",
    'function a() { const load = createRequire(__filename); return load; }',
    "function b(load) { return load('fake16'); }",
    "function c(require) { return require('fake17'); }",
    'const local = { createRequire: (x) => x };',
    'const fake = local.createRequire(__filename);',
    "fake('fake18');",
    'let mutable = createRequire(__filename);',
    'mutable = (name) => name;',
    "mutable('fake19');",
    'var hoisted = createRequire(__filename);',
    "hoisted('fake20');",
    "require('real');",
  ].join('\n');
  assert.deepEqual(moduleSpecifiers(code), ['node:module', 'real']);
});
