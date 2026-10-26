#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packageRoot = join(repositoryRoot, 'packages/runtime-core');
const sourceRoot = join(packageRoot, 'src');
const ts = require(join(repositoryRoot, 'server/node_modules/typescript/lib/typescript.js'));

const expectedExports = [
  'AgentRuntimeCapabilityResult',
  'AgentRuntimeContextPolicy',
  'AgentRuntimeCore',
  'AgentRuntimeInput',
  'AgentRuntimeModelMessage',
  'AgentRuntimePorts',
  'AgentRuntimeProgressEvent',
  'AgentRuntimeResult',
  'AgentRuntimeToolCall',
  'AgentRuntimeToolDefinition',
  'sanitizeToolDefinitions',
].sort();

function walk(directory, predicate = () => true) {
  const result = [];
  if (!existsSync(directory)) return result;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage')
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(path, predicate));
    else if (predicate(path)) result.push(path);
  }
  return result;
}

function collectSources(sourceOverrides = {}) {
  const sources = new Map();
  for (const path of walk(sourceRoot, (path) => path.endsWith('.ts'))) {
    const name = relative(sourceRoot, path);
    sources.set(name, sourceOverrides[name] ?? readFileSync(path, 'utf8'));
  }
  for (const [name, source] of Object.entries(sourceOverrides)) sources.set(name, source);
  return sources;
}

function parseSources(sources) {
  return new Map(
    [...sources].map(([name, source]) => [
      name,
      ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
    ]),
  );
}

function dynamicBuiltinNames() {
  const providerDirectories = [
    'server/src/modules/agent/primitives',
    'server/src/modules/agent/conversation',
    'server/src/modules/mcp',
  ].map((directory) => join(repositoryRoot, directory));
  const names = new Set(['openai_web_search']);
  for (const path of providerDirectories.flatMap((directory) =>
    walk(directory, (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts')),
  )) {
    const file = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        (node.name.getText(file) === 'key' ||
          node.name.getText(file) === 'toolName' ||
          node.name.getText(file) === 'name') &&
        ts.isStringLiteral(node.initializer)
      ) {
        names.add(node.initializer.text);
      }
      // 工具名也可以声明成 *_TOOL 常量（会话控制工具）
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text.endsWith('_TOOL') &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        names.add(node.initializer.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return names;
}

function assertPublicApi(sources, parsed) {
  const index = parsed.get('index.ts');
  const exports = [];
  for (const statement of index.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) {
      throw new Error('root entry may contain only named export declarations');
    }
    for (const element of statement.exportClause.elements) exports.push(element.name.text);
  }
  assert(exports.length <= 12, 'root export budget exceeds 12');
  assert(
    JSON.stringify([...exports].sort()) === JSON.stringify(expectedExports),
    `root exports differ: ${exports.sort().join(',')}`,
  );
  const declarations = new Map();
  for (const file of parsed.values()) {
    const visit = (node) => {
      if (
        (ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isFunctionDeclaration(node)) &&
        node.name
      ) {
        declarations.set(node.name.text, node);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  for (const name of expectedExports) {
    const declaration = declarations.get(name);
    assert(declaration, `missing declaration for ${name}`);
    const tags = ts.getJSDocTags(declaration).map((tag) => tag.tagName.text);
    assert(
      tags.filter((tag) => tag === 'experimental').length === 1,
      `${name} needs one @experimental`,
    );
    assert(!tags.includes('stable'), `${name} must not be @stable`);
  }
}

function assertImportsAndCapabilities(sources, parsed) {
  const graph = new Map([...sources.keys()].map((name) => [name, []]));
  const builtins = dynamicBuiltinNames();
  const forbiddenIdentifiers = new Set([
    'Logger',
    'Entity',
    'DTO',
    'ToolExecutionContext',
    'LayeredToolResult',
    'runScope',
    'toolCost',
    'balance',
    'fileRef',
    'visitorId',
    'userId',
    'lease',
    'process',
    'require',
    'module',
  ]);
  const forbiddenCalls = new Set(['Date', 'setTimeout', 'clearTimeout', 'fetch', 'randomUUID']);
  let recordOutcomeCalls = 0;

  for (const [name, file] of parsed) {
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        assert(
          specifier.startsWith('./') || specifier.startsWith('../'),
          `${name}: bare import ${specifier}`,
        );
        const resolved = relative(
          sourceRoot,
          resolve(sourceRoot, dirname(name), specifier),
        ).replace(/\\/g, '/');
        const target = resolved.endsWith('.ts') ? resolved : `${resolved}.ts`;
        assert(sources.has(target), `${name}: import escapes package source: ${specifier}`);
        graph.get(name).push(target);
      }
      if (ts.isIdentifier(node) && forbiddenIdentifiers.has(node.text)) {
        const parent = node.parent;
        const safeProperty =
          (ts.isPropertyAssignment(parent) ||
            ts.isPropertySignature(parent) ||
            ts.isPropertyAccessExpression(parent)) &&
          parent.name === node;
        assert(safeProperty, `${name}: forbidden platform identifier ${node.text}`);
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const expression = node.expression;
        const called = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression)
            ? expression.name.text
            : '';
        assert(!forbiddenCalls.has(called), `${name}: uninjected capability ${called}`);
        if (
          called === 'random' &&
          ts.isPropertyAccessExpression(expression) &&
          expression.expression.getText(file) === 'Math'
        ) {
          throw new Error(`${name}: uninjected capability Math.random`);
        }
        if (called === 'recordOutcome') recordOutcomeCalls += 1;
      }
      if (ts.isStringLiteral(node) && builtins.has(node.text)) {
        throw new Error(`${name}: concrete builtin name ${node.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert(
    recordOutcomeCalls === 0,
    `recordOutcome production calls must be 0, got ${recordOutcomeCalls}`,
  );

  const visiting = new Set();
  const visited = new Set();
  const visitGraph = (name) => {
    if (visiting.has(name)) throw new Error(`source import cycle at ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const target of graph.get(name) || []) visitGraph(target);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of graph.keys()) visitGraph(name);
}

function assertPackageJson(
  packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')),
) {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    assert(
      !packageJson[field] || Object.keys(packageJson[field]).length === 0,
      `${field} must be empty`,
    );
  }
  assert(
    JSON.stringify(packageJson.exports) === JSON.stringify({ '.': './src/index.ts' }),
    'package exports must contain only the root entry',
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function runBoundaryChecks(options = {}) {
  const sources = collectSources(options.sourceOverrides || {});
  const parsed = parseSources(sources);
  assertPackageJson(options.packageJson);
  assertPublicApi(sources, parsed);
  assertImportsAndCapabilities(sources, parsed);
  return {
    sourceCount: sources.size,
    exports: expectedExports,
    recordOutcomeProductionCalls: 0,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runBoundaryChecks();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
