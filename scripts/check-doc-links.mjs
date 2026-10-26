import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 检查仓库里当前文档的本地链接是否有效。
 *
 * - 公开文档：仓库跟踪的所有 Markdown（README、CONTRIBUTING、site/ 文档站、各包与 sandbox 的 README 等），
 *   本地链接必须指向仓库里存在的文件；不得链接到 docs/（维护者本地目录，.gitignore 忽略），
 *   也不得链接到 .gitattributes 里标记 export-ignore、不随公开仓库发布的文件。
 * - 维护者文档（.gitattributes 里标记 export-ignore 的 Markdown）：指向 docs/ 的链接只在维护者本机有效，跳过；
 *   其余本地链接照常检查。
 * - 更新日志只追加历史条目，里面的旧链接不回头改，不检查。
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localOnlyDir = resolve(root, 'docs');

/** 不随公开仓库发布的路径：.gitattributes 里标记 export-ignore 的条目（公开仓库里没有这个文件，列表为空） */
const attributesPath = resolve(root, '.gitattributes');
const exportIgnored = existsSync(attributesPath)
  ? readFileSync(attributesPath, 'utf8')
      .split('\n')
      .map((line) => line.trim().match(/^\/?(\S+)\s+export-ignore$/)?.[1])
      .filter(Boolean)
      .map((path) => resolve(root, path))
  : [];
const isNotPublished = (path) =>
  exportIgnored.some((ignored) => path === ignored || path.startsWith(ignored + sep));
const isChangelog = (path) => /(^|\/)changelog\.md$/i.test(path);

const tracked = execFileSync('git', ['ls-files', '-z', '--', '*.md'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
  .filter((path) => !isChangelog(path));
const publicFiles = tracked
  .map((path) => resolve(root, path))
  .filter((path) => !isNotPublished(path));
const maintainerFiles = tracked
  .map((path) => resolve(root, path))
  .filter((path) => isNotPublished(path));

const isInsideLocalOnlyDir = (path) => path === localOnlyDir || path.startsWith(localOnlyDir + sep);

const failures = [];
let checked = 0;
for (const file of [...publicFiles, ...maintainerFiles]) {
  const isPublic = publicFiles.includes(file);
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\[[^\]]*\]\((<?[^\s)]+>?)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
    const pathPart = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!pathPart) continue;
    const docSite = relative(root, file).startsWith('site/');
    const candidate =
      pathPart.startsWith('/') && docSite
        ? resolve(root, 'site', pathPart.slice(1))
        : resolve(dirname(file), pathPart);
    if (isInsideLocalOnlyDir(candidate)) {
      if (isPublic)
        failures.push(`${relative(root, file)}: ${target}（公开文档不能链接到不入库的 docs/）`);
      continue;
    }
    if (isPublic && isNotPublished(candidate)) {
      failures.push(`${relative(root, file)}: ${target}（公开文档不能链接到不随公开仓库发布的文件）`);
      continue;
    }
    const candidates = [candidate];
    if (!extname(candidate)) candidates.push(`${candidate}.md`, resolve(candidate, 'index.md'));
    checked++;
    if (!candidates.some((path) => existsSync(path) && statSync(path).isFile())) {
      failures.push(`${relative(root, file)}: ${target}`);
    }
  }
}
if (failures.length) {
  process.stderr.write(`发现 ${failures.length} 个失效本地文档链接：\n${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `文档链接通过：${publicFiles.length + maintainerFiles.length} 个当前文档，${checked} 个本地目标。\n`,
  );
}
