import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const testDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDirectory, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const ts = require(join(repositoryRoot, 'server/node_modules/typescript/lib/typescript.js'));
let buildDirectory;

export function compilePackage() {
  if (buildDirectory) return buildDirectory;
  buildDirectory = mkdtempSync(join(tmpdir(), '99agent-runtime-core-'));
  const sourceDirectory = join(packageRoot, 'src');
  for (const fileName of readdirSync(sourceDirectory).filter((name) => name.endsWith('.ts'))) {
    const sourcePath = join(sourceDirectory, fileName);
    const result = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        strict: true,
      },
      fileName: sourcePath,
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics || []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length) {
      throw new Error(
        errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'),
      );
    }
    const output = result.outputText.replace(
      /(from\s+['"]\.\/[^'"]+)(['"])/g,
      (_, specifier, quote) => `${specifier}.js${quote}`,
    );
    writeFileSync(join(buildDirectory, fileName.replace(/\.ts$/, '.js')), output);
  }
  writeFileSync(join(buildDirectory, 'package.json'), '{"type":"module"}\n');
  return buildDirectory;
}

export async function loadPackage() {
  return import(pathToFileURL(join(compilePackage(), 'index.js')).href);
}

export async function loadInternal(fileName) {
  const target = basename(fileName, '.ts') + '.js';
  return import(pathToFileURL(join(compilePackage(), target)).href);
}
