#!/usr/bin/env node
/**
 * 管理端设计规约守卫（设计规约的机器可校验部分，规则与理由见下方各规则的说明）。
 *
 * 用法（在 admin/ 目录下）：
 *   pnpm check:design [文件...]
 *   不传文件时全量扫描 src 下的 .vue 与 .ts（不含 .d.ts / 测试）；传入文件路径时只校验这些文件。
 *   .vue 走全部规则；.ts 只查颜色字面量（hex / rgb / hsl）与扩展包开关的引用方式。
 *   仓库没有 pre-commit hook，提交前自行执行。
 *
 * 单行豁免：在该行加注释 `design-guard-allow`（只对逐行规则生效）。
 * 整文件豁免见下方 FILE_EXEMPTIONS（必须写明理由；对逐行规则与文件级规则都生效）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** admin/ 目录由脚本位置决定，不依赖 cwd */
const ADMIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(ADMIN_ROOT, '..');

/**
 * 允许出现颜色字面量的文件（按路径后缀放行，不再按颜色值放行）：
 * 各扩展包的 brand-colors.ts（packs/commerce、packs/wechat）是品牌色 / 固定标识色的唯一登记处，
 * 页面只能 import 引用。按路径后缀匹配（带分隔符，避免 xx-brand-colors.ts 蹭放行）。
 */
const COLOR_LITERAL_FILES = ['/brand-colors.ts'];

/**
 * 扩展包开关的唯一解释处（utils/packs.ts 的 packEnabled）：只有它可以用形参接收开关值、
 * 手写「不等于 false」的比较；其它地方一律 packEnabled(import.meta.env.VITE_*_ENABLED)。
 */
const PACK_FLAG_HELPER_FILES = ['/utils/packs.ts'];

/** 整文件豁免：键为路径后缀，值为 { rules, reason }（rules 为豁免的规则 id） */
const FILE_EXEMPTIONS = {
  'src/views/user/detail.vue': {
    rules: ['no-bare-hex'],
    reason: 'echarts 图表调色板与网格线',
  },
  'src/components/TablePager/index.vue': {
    rules: ['no-raw-pagination'],
    reason: '分页组件本体，是 el-pagination 的唯一封装处',
  },
};

/** 对话框宽度档位 */
const DIALOG_WIDTHS = new Set(['500px', '600px', '700px', '800px', '1000px']);

/** 颜色字面量规则：.vue 与 .ts 都查 */
const COLOR_RULES = [
  {
    id: 'no-bare-hex',
    // 3 / 4 / 6 / 8 位 hex；CSS 里的 #id 选择器不会由纯 16 进制字符组成，个别撞上的用单行豁免
    check(line) {
      const matches = line.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) || [];
      return matches.length
        ? `禁止裸 hex ${matches.join(' ')}（用 --u-* / --el-* token；品牌色登记到 brand-colors.ts 后 import 引用）`
        : null;
    },
  },
  {
    id: 'no-raw-color-fn',
    // rgb() / rgba() / hsl() / hsla() 字面量；包着 var() 的（如 rgb(var(--u-gray-500) / 55%)）不算
    check(line) {
      return /\b(?:rgba?|hsla?)\(\s*(?!var\()/.test(line)
        ? '禁止 rgb() / rgba() / hsl() / hsla() 字面量（用 --u-* / --el-* token，透明底用 color-mix(in srgb, var(...) N%, transparent)）'
        : null;
    },
  },
];

/**
 * 扩展包开关引用规则：.vue 与 .ts 都查（PACK_FLAG_HELPER_FILES 放行）。
 * Vite 只替换 `import.meta.env.VITE_*` 的静态字面引用，把变量名当字符串传入或经变量中转都会让
 * 开关在生产构建里失效；手写比较表达式则绕开了 packEnabled 的统一语义（只有显式 false 才关闭）。
 */
const PACK_FLAG_RULES = [
  {
    id: 'pack-flag-static-ref',
    check(line) {
      const flagRefs = line.match(/import\.meta\.env\.VITE_\w+_ENABLED\b/g) || [];
      const wrapped =
        line.match(/\bpackEnabled\(\s*import\.meta\.env\.VITE_\w+_ENABLED\s*\)/g) || [];
      if (flagRefs.length !== wrapped.length) {
        return '扩展包开关只能写成 packEnabled(import.meta.env.VITE_*_ENABLED)（静态字面引用，Vite 才会替换）';
      }
      const calls = line.match(/\bpackEnabled\(/g) || [];
      if (calls.length !== wrapped.length) {
        return 'packEnabled 只接受 import.meta.env.VITE_*_ENABLED 的静态字面引用，不能传字符串或变量';
      }
      return /\.toLowerCase\(\)\s*!==\s*['"]false['"]/.test(line)
        ? '不要手写开关比较表达式，统一用 packEnabled()'
        : null;
    },
  },
];

/** 模板 / 交互规则：只查 .vue */
const TEMPLATE_RULES = [
  {
    id: 'no-raw-pagination',
    check(line) {
      return /<el-pagination\b/.test(line)
        ? '分页统一用 <TablePager>，禁止直接写 el-pagination'
        : null;
    },
  },
  {
    id: 'no-inline-filter-form',
    check(line) {
      return /<el-form\b[^>]*\binline\b/.test(line)
        ? '禁止 inline el-form 筛选表单，列表页筛选统一用 <FilterBar>'
        : null;
    },
  },
  {
    id: 'no-impl-detail-copy',
    check(line) {
      return /\[(精确|模糊)搜索\]/.test(line)
        ? '筛选文案不要标注实现细节（[精确搜索] / [模糊搜索]），直接写搜什么'
        : null;
    },
  },
];

function isSourceFile(path) {
  if (path.endsWith('.vue')) return true;
  return (
    path.endsWith('.ts') &&
    !path.endsWith('.d.ts') &&
    !path.endsWith('.spec.ts') &&
    !path.endsWith('.test.ts')
  );
}

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSourceFiles(full, out);
    else if (isSourceFile(full)) out.push(full);
  }
  return out;
}

/** el-dialog 的 width 需要跨行匹配，单独处理 */
function checkDialogWidths(source, relPath, problems) {
  const dialogRe = /<el-dialog\b[\s\S]*?>/g;
  let match;
  while ((match = dialogRe.exec(source))) {
    const tag = match[0];
    const widthMatch = tag.match(/\bwidth="([^"]+)"/);
    if (!widthMatch) continue;
    const value = widthMatch[1];
    if (DIALOG_WIDTHS.has(value)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    problems.push({
      file: relPath,
      line,
      rule: 'dialog-width-tier',
      message: `对话框宽度 ${value} 不在档位内（500px / 600px / 700px / 800px / 1000px）`,
    });
  }
}

/** 配置页(字段级自动保存)必须用 ConfigLoadGuard 挡住加载期间的编辑 */
function checkConfigLoadGuard(source, relPath, problems) {
  // 直接调 apiConfig.setConfig 的页面同样是字段级自动保存，不能靠是否引入 composable 判断
  if (!source.includes('useConfigAutoSave') && !source.includes('apiConfig.setConfig(')) return;
  if (source.includes('ConfigLoadGuard')) return;
  const index = source.includes('useConfigAutoSave')
    ? source.indexOf('useConfigAutoSave')
    : source.indexOf('apiConfig.setConfig(');
  problems.push({
    file: relPath,
    line: source.slice(0, index).split('\n').length,
    rule: 'missing-config-load-guard',
    message:
      '配置页要用 <ConfigLoadGuard :ready="isReady" :failed="loadFailed"> 包住内容，否则加载完成前的修改会被静默丢弃',
  });
}

/** 关键词位与面板字段不得承载同一个筛选条件 */
function checkKeywordFieldCollision(source, relPath, problems) {
  const keywords = [...source.matchAll(/v-model:keyword="([^"]+)"/g)];
  if (!keywords.length) return;
  const fieldKeys = new Set([...source.matchAll(/\bkey:\s*'([^']+)'/g)].map((m) => m[1]));
  for (const match of keywords) {
    const bound = match[1].split('.').pop();
    if (!fieldKeys.has(bound)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    problems.push({
      file: relPath,
      line,
      rule: 'no-duplicate-filter-entry',
      message: `关键词位绑定的 ${bound} 同时是 fields 里的字段 key，同一条件有两个入口；用 keywordSearch 收成一个`,
    });
  }
}

/**
 * 扩展包入口（src/packs/<id>/index.ts）必须用 pack.json 登记的开关名做静态引用：
 * 评分卡、删包验证与部署文档都以 pack.json 的 flag 为准，入口写别的变量名会让开关名两处不一致。
 */
function checkPackEntryFlag(file, source, relPath, problems) {
  if (!/\/src\/packs\/[^/]+\/index\.ts$/.test(relPath)) return;
  const report = (message, anchor = 'packEnabled(') => {
    const index = source.indexOf(anchor);
    problems.push({
      file: relPath,
      line: index >= 0 ? source.slice(0, index).split('\n').length : 1,
      rule: 'pack-entry-flag',
      message,
    });
  };
  const manifestPath = join(dirname(file), 'pack.json');
  if (!existsSync(manifestPath)) {
    report('扩展包目录缺少 pack.json（需声明 id / tier / flag）');
    return;
  }
  let flag;
  try {
    flag = JSON.parse(readFileSync(manifestPath, 'utf8')).flag;
  } catch {
    report('pack.json 不是合法 JSON');
    return;
  }
  if (typeof flag !== 'string' || !flag) {
    report('pack.json 缺少 flag（构建期开关的环境变量名）');
    return;
  }
  if (!source.includes(`packEnabled(import.meta.env.${flag})`)) {
    report(`包入口必须以 packEnabled(import.meta.env.${flag}) 读取 pack.json 登记的开关`);
  }
}

/** 取出 `name(` 调用的实参原文（按括号配对；字符串里的括号不计） */
function callArgumentOf(source, name) {
  const start = source.indexOf(`${name}(`);
  if (start < 0) return null;
  let depth = 0;
  let quote = '';
  for (let index = start + name.length; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start + name.length + 1, index);
    }
  }
  return null;
}

/**
 * 配置项的保存、回写与失败回滚只在 useConfigAutoSave（configSaveScheduler）里实现一次：
 * - 用了 useConfigAutoSave 的页面，写配置只能经 saveField / saveFields，不得再直接 setConfig
 *   （否则会绕开保存队列，与在途的保存竞争，回写 / 回滚也各自再包一层）；
 * - 必须告诉 composable 界面在哪：传 form（扁平表单，非字符串字段配 codecs），
 *   或同时传 read / write（嵌套对象、多个表单）；
 * - 「登录配置」页与各登录渠道包贡献的 LoginConfigTab 一律把 formInline 交给 composable。
 */
export function checkConfigAutoSaveOwnership(source, relPath, problems) {
  const argument = callArgumentOf(source, 'useConfigAutoSave');
  if (argument === null) return;
  const withForm = /(?:^|[{,\s])form\s*(?:[:,}]|$)/m.test(argument);
  const withReadWrite = /\bread\b/.test(argument) && /\bwrite\b/.test(argument);
  const isLoginTab = /\/src\/(?:views\/channel\/login|packs\/[^/]+\/LoginConfigTab)\.vue$/.test(
    relPath,
  );
  const lineOf = (anchor) => {
    const index = source.indexOf(anchor);
    return index >= 0 ? source.slice(0, index).split('\n').length : 1;
  };
  if (isLoginTab && !withForm) {
    problems.push({
      file: relPath,
      line: lineOf('useConfigAutoSave('),
      rule: 'login-tab-autosave-form',
      message:
        '登录配置页签统一 useConfigAutoSave({ form: formInline })，表单回写 / 回滚交给 composable，页面不要自己包一层',
    });
  }
  if (!withForm && !withReadWrite) {
    problems.push({
      file: relPath,
      line: lineOf('useConfigAutoSave('),
      rule: 'autosave-ui-target',
      message:
        'useConfigAutoSave 要知道界面在哪：传 form（非字符串字段配 codecs），或同时传 read 与 write，失败回滚与回写才能落到界面上',
    });
  }
  if (/\bsetConfig\(/.test(source)) {
    problems.push({
      file: relPath,
      line: lineOf('setConfig('),
      rule: 'autosave-single-writer',
      message:
        '用了 useConfigAutoSave 的页面不要再直接调用 setConfig：写配置只经 saveField / saveFields（成组用 saveFields），与其他保存排队',
    });
  }
}

function main() {
  const args = process.argv.slice(2);
  const targets = args.length
    ? args.filter((f) => isSourceFile(f)).map((f) => resolve(f))
    : collectSourceFiles(join(ADMIN_ROOT, 'src'));

  const problems = [];

  for (const file of targets) {
    const relPath = relative(ROOT, file).split(sep).join('/');
    const isVue = file.endsWith('.vue');
    const exemptionKey = Object.keys(FILE_EXEMPTIONS).find((key) => relPath.endsWith(key));
    const exemptRules = exemptionKey ? FILE_EXEMPTIONS[exemptionKey].rules : [];
    const allowColorLiterals = COLOR_LITERAL_FILES.some((suffix) => relPath.endsWith(suffix));
    const isPackFlagHelper = PACK_FLAG_HELPER_FILES.some((suffix) => relPath.endsWith(suffix));
    const rules = [
      ...(allowColorLiterals ? [] : COLOR_RULES),
      ...(isPackFlagHelper ? [] : PACK_FLAG_RULES),
      ...(isVue ? TEMPLATE_RULES : []),
    ];
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    const fileProblems = [];

    lines.forEach((line, index) => {
      if (line.includes('design-guard-allow')) return;
      for (const rule of rules) {
        const message = rule.check(line);
        if (message) {
          fileProblems.push({ file: relPath, line: index + 1, rule: rule.id, message });
        }
      }
    });

    if (isVue) {
      checkDialogWidths(source, relPath, fileProblems);
      checkKeywordFieldCollision(source, relPath, fileProblems);
      checkConfigLoadGuard(source, relPath, fileProblems);
      checkConfigAutoSaveOwnership(source, relPath, fileProblems);
    } else {
      checkPackEntryFlag(file, source, relPath, fileProblems);
    }

    problems.push(...fileProblems.filter((p) => !exemptRules.includes(p.rule)));
  }

  if (!problems.length) {
    if (!args.length) console.log(`设计规约检查通过（${targets.length} 个文件）`);
    return;
  }

  console.error('\n设计规约检查未通过：\n');
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  [${p.rule}] ${p.message}`);
  }
  console.error(
    `\n共 ${problems.length} 处。确属例外时在该行加 \`design-guard-allow\` 注释并说明理由。\n`,
  );
  process.exit(1);
}

// 作为脚本运行时检查；被测试导入时只导出检查函数
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
