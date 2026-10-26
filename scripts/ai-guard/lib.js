#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');

function runGit(args) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

// 路径一律用 -z 取、按 NUL 切分：否则 git 会把中文等非 ASCII 路径转义成带引号的形式，读取失败后被静默跳过
function splitPaths(result) {
  return (result.stdout || '').split('\0');
}

function getChangedFiles() {
  const unstaged = runGit(['diff', '-z', '--name-only', '--diff-filter=ACMR']);
  const staged = runGit(['diff', '-z', '--cached', '--name-only', '--diff-filter=ACMR']);
  const untracked = runGit(['ls-files', '-z', '--others', '--exclude-standard']);

  return unique(
    [...splitPaths(unstaged), ...splitPaths(staged), ...splitPaths(untracked)].map(normalizePath),
  );
}

function getTrackedFiles() {
  return unique(splitPaths(runGit(['ls-files', '-z'])).map(normalizePath));
}

function isIgnoredScanPath(filePath) {
  const normalized = normalizePath(filePath);
  return (
    normalized.includes('/node_modules/') ||
    normalized.startsWith('node_modules/') ||
    normalized.includes('/.git/') ||
    normalized.startsWith('.git/') ||
    normalized.includes('/dist/') ||
    normalized.endsWith('.png') ||
    normalized.endsWith('.jpg') ||
    normalized.endsWith('.jpeg') ||
    normalized.endsWith('.gif') ||
    normalized.endsWith('.webp') ||
    normalized.endsWith('.ico') ||
    normalized.endsWith('.woff') ||
    normalized.endsWith('.woff2') ||
    normalized.endsWith('.zip')
  );
}

function readTextFile(filePath, maxBytes = 1024 * 1024) {
  const absolute = path.join(repoRoot, normalizePath(filePath));
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > maxBytes) return null;

  const buffer = fs.readFileSync(absolute);
  if (buffer.includes(0)) return null;
  return buffer.toString('utf8');
}

function matchesPath(filePath, pattern) {
  const file = normalizePath(filePath);
  const target = normalizePath(pattern);
  return file === target || file.startsWith(`${target.replace(/\/$/, '')}/`);
}

function parseListArgs(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

module.exports = {
  repoRoot,
  getChangedFiles,
  getTrackedFiles,
  isIgnoredScanPath,
  readTextFile,
  matchesPath,
  parseListArgs,
  normalizePath,
};
