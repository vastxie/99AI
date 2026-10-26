/**
 * 锁文件完整性检查：仓库里各份 pnpm-lock.yaml 中，凡是带 tarball 的 resolution 都必须带合法的 integrity；
 * 远程 http(s) tarball 还必须登记在下面的已审核摘要表里，且锁文件里的值与表中一致。
 * pnpm 的部分操作（缓存里没有摘要时的 update、add 别的依赖）会把远程 tarball 的 integrity 丢掉，
 * 丢了由这里拦下，按表补回即可。
 * 不依赖 YAML 库（CI 不先安装依赖）：整份锁文件按 pnpm 实际写出的 YAML 子集逐行解析——块式映射与列表、
 * 值为标量或单行不嵌套的 {…} / […]；显式键、锚点别名标签、多行标量、合并键、跨行或嵌套的括号、制表符等
 * 其余写法一律报出文件:行号，不跳过。任何位置的映射只要带 tarball 键就按规则检查。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOCKFILES = [
  'pnpm-lock.yaml',
  'web/pnpm-lock.yaml',
  'admin/pnpm-lock.yaml',
  'server/pnpm-lock.yaml',
  'site/pnpm-lock.yaml',
];

/** 已审核的远程 tarball 摘要：新增前先下载核对内容（与已安装文件逐字一致等），再登记 */
export const REVIEWED_TARBALL_INTEGRITY = {
  'https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz':
    'sha512-+nKZ39+nvK7Qq6i0PvWWRA4j/EkfWOtkP/YhMtupm+lJIiHxUrgTr1CcKv1nBk1rHtkRRQ3O2+Ih/q/sA+FXZA==',
};

const INTEGRITY_PATTERN = /^sha(?:1|256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
/** 制表符、控制字符、YAML 1.1 会当作换行的字符与 BOM：pnpm 不会写出，出现即报错 */
function hasForbiddenCharacter(line) {
  for (const char of line) {
    const code = char.codePointAt(0);
    if (code < 0x20 || code === 0x7f || code === 0x85) return true;
    if (code === 0x2028 || code === 0x2029 || code === 0xfeff) return true;
  }
  return false;
}

/**
 * YAML 的空白只有空格与制表符（制表符已整行拒绝）：缩进、裁剪、分隔与注释边界都只认空格；
 * NBSP、全角空格等其他 Unicode 空白是标量的一部分，不能像 JS 的 trim() 与 \s 那样去掉
 */
const trimSpaces = (text) => text.replace(/^ +| +$/g, '');
const isSpaceOrEnd = (char) => char === undefined || char === ' ';

/** 值在下一行起的更深一层或是单行的 {…} / […]：只用来占位与判重，不是字符串 */
const NESTED = Symbol('nested');

class UnsupportedSyntax extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

/**
 * 逐字符扫描一行（或单行括号的内容）。只有出现在「标量开头」（行首、`{`、`[`、`,`、列表项的 `- ` 或
 * 「冒号 + 空格」之后）的引号才开始一个引号标量；普通标量里的 ' 与 " 只是普通字符。对引号之外的每个字符
 * 调用 visit，visit 返回 true 时停止并返回该位置，否则返回 -1
 */
function scanOutsideQuotes(text, visit) {
  let quote = null;
  let scalarStart = true;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote === "'") {
      if (char === "'") {
        // 单引号标量里用两个单引号表示一个单引号
        if (text[index + 1] === "'") index += 1;
        else quote = null;
      }
      continue;
    }
    if (quote === '"') {
      if (char === '\\') index += 1;
      else if (char === '"') quote = null;
      continue;
    }
    if (scalarStart && (char === "'" || char === '"')) {
      quote = char;
      scalarStart = false;
      continue;
    }
    if (visit(index, char)) return index;
    const separator =
      char === '{' ||
      char === '[' ||
      char === ',' ||
      ((char === ':' || (char === '-' && scalarStart)) && isSpaceOrEnd(text[index + 1]));
    if (separator) scalarStart = true;
    else if (char !== ' ') scalarStart = false;
  }
  if (quote) throw new UnsupportedSyntax('引号没有闭合');
  return -1;
}

/** 去掉行内注释：只有引号之外、行首或前面是空格的 # 才算注释 */
function stripComment(line) {
  const at = scanOutsideQuotes(
    line,
    (index, char) => char === '#' && (index === 0 || line[index - 1] === ' '),
  );
  return at < 0 ? line : line.slice(0, at);
}

/** 在引号之外找第一个「冒号 + 空格（或行尾）」，切成键与值（URL 里的 `https:` 不算） */
function splitKeyValue(text) {
  const at = scanOutsideQuotes(
    text,
    (index, char) => char === ':' && isSpaceOrEnd(text[index + 1]),
  );
  return at < 0 ? null : { key: text.slice(0, at), value: text.slice(at + 1) };
}

/** 解码一个标量：单引号按 YAML 规则；双引号只支持 JSON 的转义写法；普通标量原样（不能以 YAML 指示符开头） */
function decodeScalar(raw) {
  const value = trimSpaces(raw);
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(value)) throw new UnsupportedSyntax('单引号字符串的写法不对');
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('"')) {
    try {
      const decoded = JSON.parse(value);
      if (typeof decoded === 'string') return decoded;
    } catch {
      // 落到下面统一报错
    }
    throw new UnsupportedSyntax('双引号字符串只支持 JSON 的转义写法');
  }
  if (/^(?:[&*!|>%@`?#,[\]{}]|[-:](?: |$))/.test(value)) {
    throw new UnsupportedSyntax(
      '不支持锚点、别名、标签、多行字符串、显式键或以其他保留字符开头的标量',
    );
  }
  if (splitKeyValue(value)) throw new UnsupportedSyntax('值里不能再有「键: 值」');
  return value;
}

function decodeKey(raw) {
  const key = decodeScalar(raw);
  if (!key) throw new UnsupportedSyntax('键为空');
  if (key === '<<') throw new UnsupportedSyntax('不支持合并键 <<');
  return key;
}

function addField(fields, key, value) {
  if (fields.has(key)) throw new UnsupportedSyntax(`键 ${key} 在同一个映射里出现了两次`);
  fields.set(key, value);
}

/** 按引号之外的逗号切开单行括号的内容；出现嵌套的括号视为不支持 */
function splitFlowItems(text) {
  const items = [];
  let start = 0;
  scanOutsideQuotes(text, (index, char) => {
    if ('{}[]'.includes(char)) throw new UnsupportedSyntax('括号里不能再嵌套映射或列表');
    if (char === ',') {
      items.push(text.slice(start, index));
      start = index + 1;
    }
    return false;
  });
  items.push(text.slice(start));
  return items;
}

/** 单行的 {…}：返回字段；跨行与嵌套都不支持 */
function parseFlowMapping(text) {
  if (!text.endsWith('}')) throw new UnsupportedSyntax('花括号没有在同一行闭合');
  const fields = new Map();
  const body = trimSpaces(text.slice(1, -1));
  for (const item of body ? splitFlowItems(body) : []) {
    const pair = splitKeyValue(trimSpaces(item));
    if (!pair) throw new UnsupportedSyntax('花括号里缺少「键: 值」');
    addField(fields, decodeKey(pair.key), decodeScalar(pair.value));
  }
  return fields;
}

/** 单行的 […]：每一项都必须是标量 */
function parseFlowSequence(text) {
  if (!text.endsWith(']')) throw new UnsupportedSyntax('方括号没有在同一行闭合');
  const body = trimSpaces(text.slice(1, -1));
  for (const item of body ? splitFlowItems(body) : []) {
    if (!trimSpaces(item)) throw new UnsupportedSyntax('方括号里有空项');
    decodeScalar(item);
  }
}

function checkPolicy(fields, where, failures) {
  const tarball = fields.get('tarball');
  const integrity = fields.get('integrity');
  if (typeof tarball !== 'string') {
    failures.push(`${where} tarball 必须是单个字符串`);
    return;
  }
  const reviewed = REVIEWED_TARBALL_INTEGRITY[tarball];
  if (typeof integrity !== 'string' || !INTEGRITY_PATTERN.test(integrity)) {
    failures.push(
      reviewed
        ? `${where} 远程 tarball 的 integrity 丢了：按 scripts/lib/lockfile-integrity.mjs 的已审核摘要补回`
        : `${where} 带 tarball 的 resolution 缺少合法的 integrity`,
    );
    return;
  }
  if (/^https?:\/\//i.test(tarball)) {
    if (!reviewed) {
      failures.push(`${where} 远程 tarball 没有登记在已审核摘要表里：${tarball}`);
    } else if (reviewed !== integrity) {
      failures.push(`${where} 远程 tarball 的 integrity 与已审核的不一致：${tarball}`);
    }
  } else if (!tarball.startsWith('file:')) {
    failures.push(
      `${where} 不支持的 tarball 地址（只接受绝对的 http(s) 地址与 file: 本地归档）：${tarball}`,
    );
  }
}

/** packages 段里每个包条目的 resolution 必须是映射（依赖表里名叫 resolution 的包不在此列） */
const isPackageEntry = (block) => block.path.length === 2 && block.path[0] === 'packages';

/**
 * 检查一份锁文件：整份按上面的子集解析，任何位置带 tarball 的映射都按规则检查；
 * 返回失败说明（文件:行号）与检查过的 tarball 数。遇到不支持的写法时报出该行并停止解析这一份
 */
export function checkLockfileText(text, file) {
  const failures = [];
  let tarballs = 0;
  /** 一个映射结束：带 tarball 就检查（line 是块式映射的上层键所在行，或单行 {…} 所在行） */
  const finish = (fields, line) => {
    if (!fields.has('tarball')) return;
    tarballs += 1;
    checkPolicy(fields, `${file}:${line}`, failures);
  };
  const close = (block) => {
    if (block.kind === 'map') finish(block.fields, block.line);
  };
  // 打开的块：根是第 0 列的映射；值为空的键（pending）在下一行更深时开新的一层
  const stack = [{ indent: 0, kind: 'map', fields: new Map(), line: 1, path: [] }];
  let pending = null;
  const resolvePending = () => {
    if (pending?.resolution) {
      throw new UnsupportedSyntax('resolution 必须是映射', pending.line);
    }
    pending = null;
  };
  const lines = text.split(/\r?\n/);
  let lineNumber = 0;
  try {
    for (const raw of lines) {
      lineNumber += 1;
      if (hasForbiddenCharacter(raw)) {
        throw new UnsupportedSyntax('含有制表符、控制字符或 YAML 会当作换行的字符');
      }
      const line = stripComment(raw);
      const body = trimSpaces(line);
      if (!body) continue;
      const indent = line.length - line.replace(/^ +/, '').length;
      const kind = body === '-' || body.startsWith('- ') ? 'seq' : 'map';
      if (pending && indent > pending.indent) {
        if (pending.resolution && kind !== 'map') {
          throw new UnsupportedSyntax('resolution 必须是映射', pending.line);
        }
        stack.push({
          indent,
          kind,
          fields: new Map(),
          line: pending.line,
          path: [...stack.at(-1).path, pending.key],
        });
        pending = null;
      } else {
        resolvePending();
      }
      while (stack.length > 1 && stack.at(-1).indent > indent) close(stack.pop());
      const top = stack.at(-1);
      if (top.indent !== indent)
        throw new UnsupportedSyntax('缩进与上下文对不上（多行标量或缩进错位）');
      if (top.kind !== kind) throw new UnsupportedSyntax('同一层里混用了「键: 值」与列表项');

      if (kind === 'seq') {
        const item = trimSpaces(body.slice(1));
        if (!item || item.startsWith('{') || item.startsWith('[')) {
          throw new UnsupportedSyntax('列表项只支持单个标量');
        }
        decodeScalar(item);
        continue;
      }
      const pair = splitKeyValue(body);
      if (!pair) throw new UnsupportedSyntax('认不出的行：既不是「键: 值」也不是列表项');
      const key = decodeKey(pair.key);
      const rest = trimSpaces(pair.value);
      const resolution = key === 'resolution' && isPackageEntry(top);
      if (rest === '') {
        addField(top.fields, key, NESTED);
        pending = { indent, key, line: lineNumber, resolution };
      } else if (rest.startsWith('{')) {
        const fields = parseFlowMapping(rest);
        addField(top.fields, key, NESTED);
        finish(fields, lineNumber);
      } else if (rest.startsWith('[')) {
        if (resolution) throw new UnsupportedSyntax('resolution 必须是映射');
        parseFlowSequence(rest);
        addField(top.fields, key, NESTED);
      } else {
        // 先解码：锚点、别名、标签按各自的原因报出
        const value = decodeScalar(rest);
        if (resolution) throw new UnsupportedSyntax('resolution 必须是映射');
        addField(top.fields, key, value);
      }
    }
    resolvePending();
    while (stack.length) close(stack.pop());
  } catch (error) {
    if (!(error instanceof UnsupportedSyntax)) throw error;
    failures.push(`${file}:${error.line ?? lineNumber} 不支持的写法：${error.message}`);
  }
  return { failures, tarballs };
}

export function checkLockfiles(root) {
  const failures = [];
  let tarballs = 0;
  for (const file of LOCKFILES) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const result = checkLockfileText(readFileSync(path, 'utf8'), file);
    failures.push(...result.failures);
    tarballs += result.tarballs;
  }
  return { failures, tarballs };
}
