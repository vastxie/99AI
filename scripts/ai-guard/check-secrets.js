#!/usr/bin/env node
'use strict';

const { getChangedFiles, getTrackedFiles, isIgnoredScanPath, readTextFile } = require('./lib');

const args = process.argv.slice(2);
const scanAll = args.includes('--all');

const EXACT_FIXTURE_ALLOWLIST = new Set([
  // 仅包含合成坏样例，用于证明本扫描器会拒绝对应材料。
  'scripts/ai-guard/check-secrets.spec.js',
]);

/**
 * 规则分两类：
 * - vendor：带厂商前缀的形态（GitHub、AWS、Stripe 正式环境），命中即报，只排除占位写法——
 *   这些值本身就是字母数字下划线，不能再用「像代码标识符」过滤（以前因此整类失效）；
 * - generic：OpenAI 风格的 sk- 形态，前缀太常见，沿用凭据启发式（长度、字符种类、占位）。
 * 每条规则在一行内逐个匹配（全局正则，matchAll 不共享状态），一行两个密钥报两条。
 */
const SECRET_PATTERNS = [
  { name: 'OpenAI-style API key', kind: 'generic', pattern: /\b(sk-[A-Za-z0-9_-]{20,})\b/g },
  { name: 'GitHub token', kind: 'vendor', pattern: /\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g },
  { name: 'GitHub token', kind: 'vendor', pattern: /\b(github_pat_[A-Za-z0-9_]{22,})\b/g },
  { name: 'AWS access key', kind: 'vendor', pattern: /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/g },
  { name: 'Stripe live key', kind: 'vendor', pattern: /\b((?:sk|rk)_live_[A-Za-z0-9]{20,})\b/g },
  { name: 'Stripe webhook secret', kind: 'vendor', pattern: /\b(whsec_[A-Za-z0-9]{20,})\b/g },
  {
    name: 'private key block',
    kind: 'private-key',
    pattern: /^\s*(-----BEGIN [A-Z ]*PRIVATE KEY-----)\s*$/g,
  },
  // 单行写法（JSON、.env 里用 \n 或 \\n 转义换行）：标记后面紧跟密钥正文才算；
  // 代码里的模板（标记后面是 ${...}）不命中
  {
    name: 'private key block',
    kind: 'private-key',
    pattern: /(-----BEGIN [A-Z ]*PRIVATE KEY-----)(?:\\\\n|\\n|\s)*[A-Za-z0-9+/=]{64,}/g,
  },
];

function looksLikePlaceholder(value) {
  const normalized = String(value || '').toLowerCase();
  return (
    normalized.includes('example') ||
    normalized.includes('placeholder') ||
    normalized.includes('your_') ||
    normalized.includes('change_me') ||
    normalized.includes('changeme') ||
    normalized.includes('xxxx') ||
    normalized.includes('${') ||
    normalized.includes('<') ||
    normalized.includes('process.env')
  );
}

function looksLikeCredentialValue(value) {
  const normalized = String(value || '').replace(/^['"]|['"]$/g, '');
  if (normalized.length < 20 || looksLikePlaceholder(normalized)) return false;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(normalized)) return false;
  return new Set(normalized).size >= 8;
}

function scanFile(filePath) {
  if (EXACT_FIXTURE_ALLOWLIST.has(filePath)) return [];
  if (isIgnoredScanPath(filePath)) return [];
  const content = readTextFile(filePath);
  if (!content) return [];

  return scanContent(filePath, content);
}

function scanContent(filePath, content) {
  const normalizedPath = String(filePath || '').replace(/\\/g, '/');
  if (EXACT_FIXTURE_ALLOWLIST.has(normalizedPath)) return [];

  const findings = [];
  const lines = content.split('\n');
  for (const [index, line] of lines.entries()) {
    for (const { name, kind, pattern } of SECRET_PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        if (kind === 'vendor' && looksLikePlaceholder(match[1])) continue;
        if (kind === 'generic' && !looksLikeCredentialValue(match[1])) continue;
        findings.push({
          filePath,
          line: index + 1,
          name,
        });
      }
    }
  }
  if (
    /(?:^|\/)(?:aes|secret|private)[^/]*\.key$/i.test(normalizedPath) &&
    content.trim() &&
    !looksLikePlaceholder(content)
  ) {
    findings.push({ filePath: normalizedPath, line: 1, name: 'tracked symmetric key material' });
  }
  if (
    /(?:^|\/)key-segments[^/]*\.json$/i.test(normalizedPath) &&
    content.trim() &&
    !looksLikePlaceholder(content)
  ) {
    findings.push({ filePath: normalizedPath, line: 1, name: 'segmented key material' });
  }
  return findings;
}

function main() {
  const files = scanAll ? getTrackedFiles() : getChangedFiles();
  const findings = files.flatMap(scanFile);

  if (findings.length === 0) {
    console.log(
      `[ai-guard] secrets: ok (${files.length} file${files.length === 1 ? '' : 's'} scanned)`,
    );
    return;
  }

  console.error('[ai-guard] secrets: potential secret material found');
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} ${finding.name}`);
  }
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  EXACT_FIXTURE_ALLOWLIST,
  looksLikePlaceholder,
  scanContent,
  scanFile,
};
