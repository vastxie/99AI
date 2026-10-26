/**
 * 扩展包评分卡与内核预算共用：三端源码的收集口径、包清单读取、import 解析与宿主依赖归属校验。
 * 除 Node 内置模块外，依赖归属用 server 依赖里的 TypeScript 解析源码（需先在 server/ 安装依赖）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const toPosix = (value) => value.split(sep).join('/');

export const APPS = {
  server: {
    src: 'server/src',
    kernelDirs: ['modules', 'common', 'test'],
    kernelFiles: ['main.ts', 'app.module.ts', 'app.module.wiring.spec.ts'],
    extensions: ['.ts'],
    registryRoot: null,
  },
  web: {
    src: 'web/src',
    kernelDirs: ['*'],
    kernelFiles: [],
    extensions: ['.ts', '.vue', '.json'],
    registryRoot: 'packs/index.ts',
  },
  admin: {
    src: 'admin/src',
    kernelDirs: ['*'],
    kernelFiles: [],
    extensions: ['.ts', '.vue', '.json'],
    registryRoot: 'packs/index.ts',
    // 图标集数据里的图标名不是代码引用
    ignore: ['iconify/'],
  },
};

export function walk(directory, out = []) {
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${toPosix(relative(repoRoot, path))} 不是合法 JSON：${error.message}`);
  }
}

/** 三端的包清单，按 id 合并 */
export function loadManifests() {
  const packs = new Map();
  for (const [app, config] of Object.entries(APPS)) {
    const packsDir = join(repoRoot, config.src, 'packs');
    if (!existsSync(packsDir)) continue;
    for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(packsDir, entry.name);
      const manifestPath = join(dir, 'pack.json');
      const pack = packs.get(entry.name) || { id: entry.name, apps: {} };
      pack.apps[app] = {
        dir,
        manifest: existsSync(manifestPath) ? readJson(manifestPath) : null,
      };
      packs.set(entry.name, pack);
    }
  }
  return [...packs.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** 某个应用的内核源文件 */
export function kernelFiles(app) {
  const config = APPS[app];
  const srcRoot = join(repoRoot, config.src);
  return walk(srcRoot).filter((file) => {
    const rel = toPosix(relative(srcRoot, file));
    if (!config.extensions.some((ext) => file.endsWith(ext)) || file.endsWith('.d.ts'))
      return false;
    if (rel.startsWith('packs/')) return rel === config.registryRoot;
    if ((config.ignore ?? []).some((prefix) => rel.startsWith(prefix))) return false;
    if (config.kernelDirs.includes('*')) return true;
    return (
      config.kernelDirs.some((dir) => rel.startsWith(`${dir}/`)) || config.kernelFiles.includes(rel)
    );
  });
}

export function packFiles(app, dir) {
  return walk(dir).filter((file) => APPS[app].extensions.some((ext) => file.endsWith(ext)));
}

export const SPECIFIER =
  /(?:from\s+|import\(|require\(|jest\.mock\(|jest\.requireActual\()\s*['"]([^'"]+)['"]/g;

/** 把模块说明符归一成包名：@scope/name/sub → @scope/name，name/sub → name */
function packageName(specifier) {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}

let typescript;

/** 解析源码用 server 依赖里的 TypeScript：字符串按真实值还原转义，正则与除号不会混淆 */
function loadTypeScript() {
  if (typescript) return typescript;
  const path = join(repoRoot, 'server/node_modules/typescript/lib/typescript.js');
  if (!existsSync(path))
    throw new Error(
      '依赖归属校验用 server 依赖里的 TypeScript 解析源码，请先在 server/ 执行 pnpm install',
    );
  typescript = createRequire(import.meta.url)(path);
  return typescript;
}

/**
 * 源文件里的脚本及其语法：.vue 去掉 HTML 注释后取 <script> 块（按 lang，缺省为 js），
 * .ts / .tsx / .js / .jsx（含 .mts / .cjs 等）取全文，JSON 等没有脚本。
 */
function scriptsOf(file, text) {
  if (file.endsWith('.vue'))
    return [
      ...text.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
    ].map((match) => ({
      code: match[2],
      syntax: (/\blang\s*=\s*["']?(tsx|ts|jsx|js)\b/i.exec(match[1])?.[1] ?? 'js').toLowerCase(),
    }));
  const extension = /\.[cm]?([jt]sx?)$/.exec(file)?.[1];
  return extension ? [{ code: text, syntax: extension }] : [];
}

/** 按语法选解析模式：.tsx / .jsx 里的 JSX 文本不会被当成代码 */
function parse({ code, syntax }, file) {
  const ts = loadTypeScript();
  const kinds = {
    ts: ts.ScriptKind.TS,
    tsx: ts.ScriptKind.TSX,
    js: ts.ScriptKind.JS,
    jsx: ts.ScriptKind.JSX,
  };
  return ts.createSourceFile(file, code, ts.ScriptTarget.Latest, false, kinds[syntax]);
}

/**
 * 内核用到的包：原文里任何以引号出现的包名（含注释、模板文字、JSON），加上解析出的全部字符串字面量
 * 的真实值（转义写法也能还原）。漏判会让内核依赖被扩展包认领，这里宁可多算：多算最多让包的声明报
 * 「内核也在用」。动态计算出来的模块名不在校验范围内。
 */
export function kernelReferences(files) {
  const ts = loadTypeScript();
  const found = new Set();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(['"`])([@a-z0-9][\w.@/-]*)\1/gi)) {
      found.add(packageName(match[2]));
    }
    for (const script of scriptsOf(file, text)) {
      const visit = (node) => {
        if (ts.isStringLiteralLike(node) && /^[@a-z0-9]/i.test(node.text))
          found.add(packageName(node.text));
        ts.forEachChild(node, visit);
      };
      visit(parse(script, file));
    }
  }
  return found;
}

/**
 * 单文件程序：只为按真实绑定解析标识符（哪个声明、从哪里导入），不做类型检查、不解析其他文件。
 */
function bindScript({ code, syntax }, file) {
  const ts = loadTypeScript();
  const fileName = `${file}.${syntax}`;
  const kinds = {
    ts: ts.ScriptKind.TS,
    tsx: ts.ScriptKind.TSX,
    js: ts.ScriptKind.JS,
    jsx: ts.ScriptKind.JSX,
  };
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    kinds[syntax],
  );
  const host = {
    getSourceFile: (name) => (name === fileName ? sourceFile : undefined),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => name === fileName,
    readFile: () => undefined,
  };
  const program = ts.createProgram({
    rootNames: [fileName],
    options: { noResolve: true, noLib: true, allowJs: true, jsx: ts.JsxEmit.Preserve, types: [] },
    host,
  });
  return { sourceFile: program.getSourceFile(fileName), checker: program.getTypeChecker() };
}

/**
 * 代码里真正的模块引用（字面量参数）：import / export … from、import x = require()、require()、
 * require.resolve()、import()、import.meta.resolve()、import('x').Type、jest.mock()、jest.requireActual()，
 * 以及两类加载函数——按真实绑定判断，不按名字：
 *   - 由 node:module 的 createRequire() 得到的函数（const load = createRequire(...); load('x')）；
 *   - 从路径以 import-dynamic 结尾的模块导入的 importDynamic() 助手。
 * require 只认全局的，或绑定到上面那类加载函数的；同名的无关函数、别的作用域里的变量都不算。
 */
export function moduleSpecifiers(code, file = 'module.ts', syntax = 'ts') {
  const ts = loadTypeScript();
  const { sourceFile, checker } = bindScript({ code, syntax }, file);
  const found = [];
  const push = (node) => {
    if (node && ts.isStringLiteralLike(node)) found.push(node.text);
  };
  const declarationOf = (identifier) => checker.getSymbolAtLocation(identifier)?.declarations?.[0];
  /** 标识符是否从 moduleTest 所指的模块导入了 importedName */
  const importedFrom = (identifier, importedName, moduleTest) => {
    const declaration = declarationOf(identifier);
    if (!declaration || !ts.isImportSpecifier(declaration)) return false;
    const name = (declaration.propertyName ?? declaration.name).text;
    const importDeclaration = declaration.parent.parent.parent;
    return (
      name === importedName &&
      ts.isStringLiteral(importDeclaration.moduleSpecifier) &&
      moduleTest(importDeclaration.moduleSpecifier.text)
    );
  };
  const isNodeModule = (specifier) => specifier === 'node:module' || specifier === 'module';
  /** const load = createRequire(...)，且 createRequire 来自 node:module；let / var 可能被改写，不算 */
  const isCreateRequireResult = (identifier) => {
    const declaration = declarationOf(identifier);
    return (
      !!declaration &&
      ts.isVariableDeclaration(declaration) &&
      ts.isVariableDeclarationList(declaration.parent) &&
      (declaration.parent.flags & ts.NodeFlags.Const) !== 0 &&
      !!declaration.initializer &&
      ts.isCallExpression(declaration.initializer) &&
      ts.isIdentifier(declaration.initializer.expression) &&
      importedFrom(declaration.initializer.expression, 'createRequire', isNodeModule)
    );
  };
  /** 全局 require（文件里没有同名声明），或绑定到 createRequire 结果 */
  const isRequire = (identifier) =>
    (identifier.text === 'require' && !declarationOf(identifier)) ||
    isCreateRequireResult(identifier);
  const isLoader = (callee) =>
    ts.isIdentifier(callee) &&
    (isRequire(callee) ||
      importedFrom(callee, 'importDynamic', (specifier) =>
        /(^|\/)import-dynamic$/.test(specifier),
      ));
  const isMember = (callee, test, name) =>
    ts.isPropertyAccessExpression(callee) && callee.name.text === name && test(callee.expression);
  const isImportMeta = (node) =>
    ts.isMetaProperty(node) &&
    node.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.name.text === 'meta';
  const isJestObject = (node) =>
    ts.isIdentifier(node) && node.text === 'jest' && !declarationOf(node);
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      push(node.moduleSpecifier);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      push(node.moduleReference.expression);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      push(node.argument.literal);
    else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isResolve =
        isMember(callee, (object) => ts.isIdentifier(object) && isRequire(object), 'resolve') ||
        isMember(callee, isImportMeta, 'resolve');
      const isJest =
        isMember(callee, isJestObject, 'mock') || isMember(callee, isJestObject, 'requireActual');
      if (isImport || isLoader(callee) || isResolve || isJest) push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * 扩展包用到的包：只认代码里真正的模块引用（.vue 只看去掉 HTML 注释后的 <script>），
 * 注释、字符串内容、模板文字与正则都不算。漏判最多让声明报「声明了却没用到」。
 */
export function packImports(files) {
  const found = new Set();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const script of scriptsOf(file, text)) {
      for (const specifier of moduleSpecifiers(script.code, file, script.syntax))
        found.add(packageName(specifier));
    }
  }
  return found;
}

/** 依赖归属只在服务端做门禁：只有服务端扩展包在 pack.json 里声明依赖，内核预算也只统计服务端依赖 */
export const OWNERSHIP_APP = 'server';

const CODE_FILE = /\.[cm]?[jt]sx?$/;
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
/**
 * server/ 根下的运行期目录（均被 .gitignore 忽略）：dev-build.sh 构建到 public/ 的前端与公开上传、
 * 私有存储、local 沙箱工作区、PM2 日志。里面是部署后才有的文件，不是源码；扫进来会把前端包里的
 * 依赖名误当成内核在用。
 */
const RUNTIME_DIRS = new Set(['public', 'storage', 'data/sandboxes', 'logs']);

/**
 * 服务端「内核」的扫描范围：server/ 下除扩展包目录、依赖、构建产物与运行期目录外的全部代码文件
 * （.ts / .tsx / .d.ts / .js / .jsx / .mjs / .cjs，含测试、声明文件与脚本）。范围宁宽勿窄，
 * 宽了最多让声明报「内核也在用」。
 */
export function ownershipKernelFiles(root = join(repoRoot, 'server'), out = [], base = root) {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      if (toPosix(path).endsWith('/src/packs')) continue;
      if (RUNTIME_DIRS.has(toPosix(relative(base, path)))) continue;
      ownershipKernelFiles(path, out, base);
    } else if (CODE_FILE.test(entry.name)) out.push(path);
  }
  return out;
}

/** 各端宿主 package.json 的运行时依赖，以及内核与每个包实际 import 到的包名 */
export function analyzeDependencies(packs) {
  const usage = new Map();
  for (const [app, config] of Object.entries(APPS)) {
    const packagePath = join(repoRoot, config.src, '..', 'package.json');
    const host = new Set(
      existsSync(packagePath) ? Object.keys(readJson(packagePath).dependencies || {}) : [],
    );
    const packSpecifiers = new Map();
    for (const pack of packs) {
      const entry = pack.apps[app];
      if (!entry) continue;
      const files =
        app === OWNERSHIP_APP
          ? walk(entry.dir).filter((file) => CODE_FILE.test(file))
          : packFiles(app, entry.dir);
      packSpecifiers.set(pack.id, packImports(files));
    }
    const kernel = app === OWNERSHIP_APP ? ownershipKernelFiles() : kernelFiles(app);
    usage.set(app, { host, kernel: kernelReferences(kernel), packs: packSpecifiers });
  }
  return usage;
}

/**
 * 依赖归属：服务端宿主 package.json 的运行时依赖只被扩展包使用时，由使用它的包在 pack.json 的
 * dependencies 里声明。依赖仍装在宿主（nest build 与运行时按宿主解析），声明让删包时知道哪些依赖
 * 可以一并移除，内核预算也只计内核自己的依赖。
 * 客户端（web / admin）的包自带 package.json（pnpm workspace 子包），依赖写在那里；
 * 宿主里只被包使用的依赖只作提示，pack.json 里写 dependencies 反而是错误。
 *
 * 返回：
 *   problems  每个包的归属问题（评分卡据此判失败，与等级无关）
 *   owned     服务端通过校验、可以不计入内核依赖的宿主依赖：内核没用、至少一个包在用、
 *             用它的包都声明了、声明它的包都在用
 *   leaks     只被扩展包使用、却有包没声明（服务端）或仍留在宿主（客户端）的依赖（提示用）
 */
export function dependencyOwnership(packs, usage) {
  const problems = new Map();
  const owned = new Map();
  const leaks = [];
  const report = (id, message) => {
    if (!problems.has(id)) problems.set(id, []);
    problems.get(id).push(message);
  };
  for (const [app, { host, kernel, packs: imports }] of usage) {
    const gated = app === OWNERSHIP_APP;
    const declarers = new Map();
    for (const pack of packs) {
      const entry = pack.apps[app];
      if (!entry) continue;
      const declared = entry.manifest?.dependencies ?? [];
      if (!gated) {
        if (declared.length)
          report(
            pack.id,
            `${app} 端的 pack.json 不写 dependencies：客户端包的依赖写在包自己的 package.json`,
          );
        continue;
      }
      const imported = imports.get(pack.id) ?? new Set();
      for (const dependency of declared) {
        if (!declarers.has(dependency)) declarers.set(dependency, new Set());
        declarers.get(dependency).add(pack.id);
        if (!host.has(dependency))
          report(
            pack.id,
            `dependencies 里的 ${dependency} 不在 ${app}/package.json 的 dependencies 中`,
          );
        else if (!imported.has(dependency))
          report(pack.id, `dependencies 里的 ${dependency} 没有被包内代码使用`);
        if (kernel.has(dependency))
          report(pack.id, `${dependency} 内核也在用，不能声明为扩展包独占`);
      }
      for (const dependency of imported) {
        if (host.has(dependency) && !kernel.has(dependency) && !declared.includes(dependency))
          report(
            pack.id,
            `${app} 依赖 ${dependency} 只有扩展包在用，请在 pack.json 的 dependencies 里声明`,
          );
      }
    }

    const appOwned = new Set();
    for (const dependency of host) {
      if (kernel.has(dependency)) continue;
      const users = [...imports.entries()]
        .filter(([, specifiers]) => specifiers.has(dependency))
        .map(([id]) => id);
      const declaredBy = declarers.get(dependency) ?? new Set();
      const undeclared = users.filter((id) => !declaredBy.has(id));
      if (undeclared.length) leaks.push({ app, dependency, packs: undeclared });
      if (
        gated &&
        users.length &&
        !undeclared.length &&
        [...declaredBy].every((id) => users.includes(id))
      )
        appOwned.add(dependency);
    }
    owned.set(app, appOwned);
  }
  return { problems, owned, leaks };
}
