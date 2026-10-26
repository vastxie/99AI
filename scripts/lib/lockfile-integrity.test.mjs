import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REVIEWED_TARBALL_INTEGRITY,
  checkLockfileText,
  checkLockfiles,
} from './lockfile-integrity.mjs';
import { repoRoot } from './pack-sources.mjs';

const XLSX = 'https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz';
const XLSX_INTEGRITY = REVIEWED_TARBALL_INTEGRITY[XLSX];
const OTHER_INTEGRITY = `sha512-${'B'.repeat(86)}==`;

/** 一份只有 packages 段的锁文件，resolution 写法由用例给出 */
const lockfile = (...resolutionLines) =>
  [
    "lockfileVersion: '9.0'",
    '',
    'packages:',
    '',
    '  some-package@1.0.0:',
    ...resolutionLines,
    '    version: 1.0.0',
    '',
  ].join('\n');

const check = (...resolutionLines) => checkLockfileText(lockfile(...resolutionLines), 'test.yaml');

test('the repository lockfiles pass: every tarball carries the reviewed digest', () => {
  const result = checkLockfiles(repoRoot);
  assert.deepEqual(result.failures, []);
  assert.equal(result.tarballs, 1);
});

test('accepts the reviewed remote tarball in the single-line form pnpm writes', () => {
  assert.deepEqual(check(`    resolution: {integrity: ${XLSX_INTEGRITY}, tarball: ${XLSX}}`), {
    failures: [],
    tarballs: 1,
  });
});

test('accepts the block form and quoted keys or values', () => {
  assert.deepEqual(
    check('    resolution:', `      integrity: ${XLSX_INTEGRITY}`, `      'tarball': "${XLSX}"`)
      .failures,
    [],
  );
});

test('ignores registry packages and git resolutions without a tarball', () => {
  assert.deepEqual(check(`    resolution: {integrity: ${OTHER_INTEGRITY}}`).failures, []);
  assert.deepEqual(
    check('    resolution: {commit: 0123abc, repo: https://example.invalid/repo.git, type: git}')
      .failures,
    [],
  );
});

test('requires a well-formed digest on every tarball, local archives included', () => {
  assert.deepEqual(
    check(`    resolution: {integrity: ${OTHER_INTEGRITY}, tarball: file:vendor/a.tgz}`).failures,
    [],
  );
  for (const resolution of [
    '    resolution: {tarball: file:vendor/a.tgz}',
    '    resolution: {integrity: , tarball: file:vendor/a.tgz}',
    '    resolution: {integrity: md5-abc, tarball: file:vendor/a.tgz}',
  ]) {
    assert.match(
      check(resolution).failures.join('\n'),
      /test\.yaml:6 带 tarball 的 resolution 缺少合法的 integrity/,
    );
  }
});

test('tells how to restore a reviewed digest that pnpm dropped', () => {
  assert.match(
    check(`    resolution: {tarball: ${XLSX}}`).failures.join('\n'),
    /integrity 丢了：按 scripts\/lib\/lockfile-integrity\.mjs 的已审核摘要补回/,
  );
});

test('rejects remote tarballs that are not reviewed or whose digest differs', () => {
  assert.match(
    check(
      `    resolution: {integrity: ${OTHER_INTEGRITY}, tarball: https://example.invalid/pkg.tgz}`,
    ).failures.join('\n'),
    /没有登记在已审核摘要表里/,
  );
  assert.match(
    check(`    resolution: {integrity: ${OTHER_INTEGRITY}, tarball: ${XLSX}}`).failures.join('\n'),
    /与已审核的不一致/,
  );
  // gitHosted 归档也是远程 tarball
  assert.match(
    check(
      `    resolution: {integrity: ${OTHER_INTEGRITY}, tarball: https://codeload.github.com/o/r/tar.gz/abc, gitHosted: true}`,
    ).failures.join('\n'),
    /没有登记在已审核摘要表里/,
  );
});

test('rejects tarball addresses that pnpm would resolve against the registry', () => {
  for (const tarball of [
    '//example.invalid/pkg.tgz',
    'pkg/-/pkg-1.0.0.tgz',
    'ftp://example.invalid/a.tgz',
  ]) {
    assert.match(
      check(`    resolution: {integrity: ${OTHER_INTEGRITY}, tarball: ${tarball}}`).failures.join(
        '\n',
      ),
      /不支持的 tarball 地址/,
    );
  }
});

test('fails on syntax it does not support instead of skipping it', () => {
  const cases = [
    [['    resolution: {', `      tarball: ${XLSX}`, '    }'], /花括号没有在同一行闭合/],
    [
      ['    resolution:', '      tarball:', `        url: ${XLSX}`],
      /test\.yaml:6 tarball 必须是单个字符串/,
    ],
    // 更深一层的 integrity 不是 resolution 自己的字段，不能拿来当作已带摘要
    [
      ['    resolution:', '      tarball: file:a.tgz', `        integrity: ${OTHER_INTEGRITY}`],
      /test\.yaml:8 不支持的写法：缩进与上下文对不上/,
    ],
    [['    resolution: {integrity: {nested: 1}, tarball: file:a.tgz}'], /括号里不能再嵌套/],
    [['    resolution: *anchor'], /锚点、别名/],
    [['    resolution:', `      tarball: *ref`], /锚点、别名/],
    [[`    resolution: {tarball: file:a.tgz, tarball: file:b.tgz}`], /出现了两次/],
    [['    resolution:'], /test\.yaml:6 不支持的写法：resolution 必须是映射/],
    [['    resolution: file:a.tgz'], /resolution 必须是映射/],
  ];
  for (const [lines, pattern] of cases) {
    assert.match(check(...lines).failures.join('\n'), pattern, lines.join(' / '));
  }
});

test('treats # as a comment only outside quotes and after whitespace', () => {
  assert.deepEqual(
    check(
      `    resolution: {integrity: ${XLSX_INTEGRITY}, tarball: "${XLSX}#frag"} # trailing comment`,
    )
      .failures.join('\n')
      .includes('没有登记在已审核摘要表里'),
    true,
  );
  assert.deepEqual(
    check(`    resolution: {integrity: ${XLSX_INTEGRITY}, tarball: ${XLSX}} # ok`).failures,
    [],
  );
  assert.deepEqual(check(`# resolution: {tarball: ${XLSX}}`).failures, []);
  // 普通标量里紧贴在字符后面的 # 不是注释
  assert.deepEqual(
    check(`    resolution: {integrity: ${OTHER_INTEGRITY}, tarball: file:vendor/a#b.tgz}`).failures,
    [],
  );
  // 引号里、前面是空格的 # 仍是值的一部分
  assert.deepEqual(
    check(`    resolution: {integrity: ${OTHER_INTEGRITY}, tarball: "file:vendor/a #1.tgz"}`)
      .failures,
    [],
  );
});

test('treats quotes inside plain scalars as ordinary characters', () => {
  // 普通标量里的撇号不是引号边界：tarball 字段不能被吞掉
  assert.match(
    check(
      "    resolution: {note: a'b, tarball: https://example.invalid/a.tgz, other: c'd}",
    ).failures.join('\n'),
    /test\.yaml:6 带 tarball 的 resolution 缺少合法的 integrity/,
  );
  assert.match(
    check('    resolution: {note: say "hi", tarball: https://example.invalid/a.tgz}').failures.join(
      '\n',
    ),
    /test\.yaml:6 带 tarball 的 resolution 缺少合法的 integrity/,
  );
  // 普通标量里前面是空白的 # 是注释（YAML 规则），注释之后的内容不算
  assert.match(
    check(
      `    resolution: {integrity: ${XLSX_INTEGRITY}, tarball: ${XLSX}} # it's fine`,
    ).failures.join('\n'),
    /^$/,
  );
});

test('recognizes quoted keys and spaces before the colon on the resolution line', () => {
  for (const key of ["'resolution'", '"resolution"', 'resolution ']) {
    assert.match(
      check(`    ${key}: {tarball: https://example.invalid/a.tgz}`).failures.join('\n'),
      /test\.yaml:6 带 tarball 的 resolution 缺少合法的 integrity/,
      key,
    );
  }
});

test('reports unsupported double-quoted escapes with the file and line instead of throwing', () => {
  assert.match(
    check(`    resolution: {integrity: ${XLSX_INTEGRITY}, "\\x74arball": ${XLSX}}`).failures.join(
      '\n',
    ),
    /test\.yaml:6 不支持的写法：双引号字符串只支持 JSON 的转义写法/,
  );
  assert.match(
    check('    "\\x72esolution": {tarball: https://example.invalid/a.tgz}').failures.join('\n'),
    /test\.yaml:6 不支持的写法：双引号字符串只支持 JSON 的转义写法/,
  );
});

test('catches unusual entries appended to the real web lockfile', () => {
  const real = readFileSync(join(repoRoot, 'web/pnpm-lock.yaml'), 'utf8');
  const appended = [
    real.trimEnd(),
    '',
    '  extra-one@1.0.0:',
    "    resolution: {note: a'b, tarball: https://example.invalid/a.tgz, other: c'd}",
    '',
    '  extra-two@1.0.0:',
    "    'resolution': {tarball: https://example.invalid/b.tgz}",
    '',
    '  extra-three@1.0.0:',
    '    resolution : {tarball: https://example.invalid/c.tgz}',
    '',
  ].join('\n');
  const result = checkLockfileText(appended, 'web/pnpm-lock.yaml');
  assert.equal(result.tarballs, 4);
  assert.equal(result.failures.length, 3);
  assert.deepEqual(checkLockfileText(real, 'web/pnpm-lock.yaml'), { failures: [], tarballs: 1 });
});

/** 把一段包条目插进真实 web 锁文件的 packages 段开头，返回文本与插入的第一行行号 */
const insertIntoRealPackages = (entry) => {
  const real = readFileSync(join(repoRoot, 'web/pnpm-lock.yaml'), 'utf8');
  const marker = '\npackages:\n\n';
  const at = real.indexOf(marker) + marker.length;
  assert.ok(at > marker.length);
  return {
    text: `${real.slice(0, at)}${entry}\n\n${real.slice(at)}`,
    firstLine: real.slice(0, at).split('\n').length,
  };
};

test('fails closed on YAML forms outside the subset pnpm writes, inside the real packages section', () => {
  const cases = [
    // 显式键：解析器读出 resolution.tarball
    [
      ['  added@1.0.0:', '    ? resolution', '    : {tarball: https://example.invalid/a.tgz}'],
      1,
      /认不出的行/,
    ],
    // 包级的单行映射里再嵌套 resolution
    [
      ['  added@1.0.0: {resolution: {tarball: https://example.invalid/a.tgz}}'],
      0,
      /括号里不能再嵌套/,
    ],
    [
      ['  added@1.0.0:', '    <<: {resolution: {tarball: https://example.invalid/a.tgz}}'],
      1,
      /合并键/,
    ],
    [['  added@1.0.0:', "    resolution: {integrity: x, '<<': {}}"], 1, /括号里不能再嵌套/],
    [['  added@1.0.0:', "    resolution: {integrity: x, '<<': y}"], 1, /合并键/],
    [
      ['  added@1.0.0:', '    deps:', '      - tarball: https://example.invalid/a.tgz'],
      2,
      /值里不能再有「键: 值」/,
    ],
    [['  added@1.0.0:', '    deps:', '      -', '        tarball: x'], 2, /列表项只支持单个标量/],
    [
      ['  added@1.0.0:', '    deps: [tarball: https://example.invalid/a.tgz]'],
      1,
      /值里不能再有「键: 值」/,
    ],
    [['  added@1.0.0:', '    resolution:', '    - x'], 1, /resolution 必须是映射/],
    [['  added@1.0.0:', '    resolution:', '      - x'], 1, /resolution 必须是映射/],
    // 同一层里混用键与列表项：列表块里的 tarball 键不能被当成别的东西放过
    [
      ['  added@1.0.0:', '    deps:', '      - a', '      tarball: https://example.invalid/a.tgz'],
      3,
      /混用/,
    ],
    [['  added@1.0.0:', '    cpu: [x64]', '    - x'], 2, /混用/],
    [['  added@1.0.0:', '\tresolution: {tarball: https://example.invalid/a.tgz}'], 1, /制表符/],
    [['---', '  added@1.0.0: {}'], 0, /认不出的行/],
    [
      ['  added@1.0.0:', `    note: x${String.fromCharCode(0x2028)}    resolution: {tarball: a}`],
      1,
      /YAML 会当作换行的字符/,
    ],
    [
      [
        '  added@1.0.0:',
        '    resolution:',
        '      tarball: https://example.invalid/a',
        '        b.tgz',
      ],
      3,
      /缩进与上下文对不上/,
    ],
    [
      ['  added@1.0.0:', "    resolution: {tarball: 'https://example.invalid/a'x'}"],
      1,
      /单引号字符串的写法不对/,
    ],
    [
      ['  added@1.0.0:', '    resolution: !!map {tarball: https://example.invalid/a.tgz}'],
      1,
      /标签/,
    ],
  ];
  for (const [entry, offset, pattern] of cases) {
    const { text, firstLine } = insertIntoRealPackages(entry.join('\n'));
    const result = checkLockfileText(text, 'web/pnpm-lock.yaml');
    assert.equal(result.failures.length, 1, entry.join(' / '));
    assert.match(
      result.failures[0],
      new RegExp(`^web/pnpm-lock\\.yaml:${firstLine + offset} `),
      entry.join(' / '),
    );
    assert.match(result.failures[0], pattern, entry.join(' / '));
  }
});

test('checks a tarball in any mapping, including a package-level single-line mapping', () => {
  const { text, firstLine } = insertIntoRealPackages(
    '  added@1.0.0: {tarball: https://example.invalid/a.tgz}',
  );
  assert.deepEqual(checkLockfileText(text, 'web/pnpm-lock.yaml'), {
    failures: [`web/pnpm-lock.yaml:${firstLine} 带 tarball 的 resolution 缺少合法的 integrity`],
    tarballs: 2,
  });
});

test('accepts quoted list items whose text contains # or commas', () => {
  const { text } = insertIntoRealPackages(
    [
      '  added@1.0.0:',
      `    resolution: {integrity: ${OTHER_INTEGRITY}}`,
      '    cpu: [\'a #b\', "c, d"]',
      '    deps:',
      "      - 'e #f'",
      '      - "g, h"',
    ].join('\n'),
  );
  assert.deepEqual(checkLockfileText(text, 'web/pnpm-lock.yaml'), { failures: [], tarballs: 1 });
});

test('a dependency named resolution is a version, not a resolution', () => {
  const text = [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    '      resolution:',
    '        specifier: ^1.0.0',
    '        version: 1.0.0',
    '',
    'packages:',
    '',
    '  resolution@1.0.0:',
    `    resolution: {integrity: ${OTHER_INTEGRITY}}`,
    '',
    'snapshots:',
    '',
    '  some-package@1.0.0:',
    '    dependencies:',
    '      resolution: 1.0.0',
    '',
  ].join('\n');
  assert.deepEqual(checkLockfileText(text, 'test.yaml'), { failures: [], tarballs: 0 });
});

/** JS 的 trim() 与 \s 会当作空白、YAML 却当作普通字符的 Unicode 空白（NBSP、全角空格等） */
const UNICODE_SPACES = [0xa0, 0x1680, 0x2000, 0x2007, 0x200a, 0x202f, 0x205f, 0x3000].map((code) =>
  String.fromCharCode(code),
);

test('keeps Unicode spaces that YAML treats as content in keys, values and comment boundaries', () => {
  const real = readFileSync(join(repoRoot, 'web/pnpm-lock.yaml'), 'utf8');
  const lines = real.split('\n');
  const at = lines.findIndex((line) => line.includes(`tarball: ${XLSX}`));
  assert.ok(at > 0);
  const original = lines[at];
  const withLine = (line) => {
    const copy = [...lines];
    copy[at] = line;
    return checkLockfileText(copy.join('\n'), 'web/pnpm-lock.yaml');
  };
  const where = `web/pnpm-lock.yaml:${at + 1} `;
  for (const space of UNICODE_SPACES) {
    const label = `U+${space.charCodeAt(0).toString(16).toUpperCase()}`;
    // 键尾：YAML 读出的键是 "integrity<空白>"，真正的 integrity 不存在
    assert.deepEqual(
      withLine(original.replace('integrity:', `integrity${space}:`)).failures,
      [
        `${where}远程 tarball 的 integrity 丢了：按 scripts/lib/lockfile-integrity.mjs 的已审核摘要补回`,
      ],
      label,
    );
    // 值尾：地址已不是审核表里的那一个
    assert.match(
      withLine(original.replace(`${XLSX}}`, `${XLSX}${space}}`)).failures.join('\n'),
      /没有登记在已审核摘要表里/,
      label,
    );
    // 注释边界：前面是这种空白的 # 不是注释，# 之后仍属于值
    assert.match(
      withLine(original.replace(`${XLSX}}`, `${XLSX}${space}#x}`)).failures.join('\n'),
      /没有登记在已审核摘要表里/,
      label,
    );
  }
  // 块式写法的键尾
  const block = insertIntoRealPackages(
    [
      '  added@1.0.0:',
      '    resolution:',
      `      integrity${UNICODE_SPACES[0]}: ${XLSX_INTEGRITY}`,
      `      tarball: ${XLSX}`,
    ].join('\n'),
  );
  assert.deepEqual(checkLockfileText(block.text, 'web/pnpm-lock.yaml').failures, [
    `web/pnpm-lock.yaml:${block.firstLine + 1} 远程 tarball 的 integrity 丢了：按 scripts/lib/lockfile-integrity.mjs 的已审核摘要补回`,
  ]);
  // 只有普通空格才是缩进与分隔：原文不变时仍然通过
  assert.deepEqual(withLine(original).failures, []);
});

test('only plain spaces separate keys, start quoted scalars and indent lines', () => {
  const nbsp = UNICODE_SPACES[0];
  const cases = [
    // 「冒号 + NBSP」不是键值分隔：这一行既不是「键: 值」也不是列表项
    [['  added@1.0.0:', `    note:${nbsp}x`], 1, /认不出的行/],
    // NBSP 之后的引号是普通字符，引号里的「: 」照样是键值分隔
    [['  added@1.0.0:', `    note: ${nbsp}'a: b'`], 1, /值里不能再有「键: 值」/],
    // NBSP 开头的行缩进为 0：resolution 没有子项
    [
      ['  added@1.0.0:', '    resolution:', `${nbsp}     tarball: https://example.invalid/a.tgz`],
      1,
      /resolution 必须是映射/,
    ],
  ];
  for (const [entry, offset, pattern] of cases) {
    const { text, firstLine } = insertIntoRealPackages(entry.join('\n'));
    const result = checkLockfileText(text, 'web/pnpm-lock.yaml');
    assert.equal(result.failures.length, 1, entry.join(' / '));
    assert.match(result.failures[0], new RegExp(`^web/pnpm-lock\\.yaml:${firstLine + offset} `));
    assert.match(result.failures[0], pattern, entry.join(' / '));
  }
});
