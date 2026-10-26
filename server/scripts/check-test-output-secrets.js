#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const patterns = [
  'SECRET_TOKEN',
  'RAW_SECRET',
  'STDOUT_SECRET',
  'PROVIDER_SECRET',
  'SECRET_API_KEY',
  'SECRET_BEARER',
];

const files = process.argv.slice(2);

function write(message) {
  process.stdout.write(`${message}\n`);
}

function writeError(message) {
  process.stderr.write(`${message}\n`);
}

if (files.length === 0) {
  writeError('Usage: node scripts/check-test-output-secrets.js <log-file> [...log-file]');
  process.exit(1);
}

const findings = [];

for (const file of files) {
  const resolvedPath = path.resolve(file);

  if (!fs.existsSync(resolvedPath)) {
    findings.push({ file: resolvedPath, pattern: 'MISSING_FILE' });
    continue;
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');

  for (const pattern of patterns) {
    if (content.includes(pattern)) {
      findings.push({ file: resolvedPath, pattern });
    }
  }
}

if (findings.length > 0) {
  writeError('Sensitive test output patterns detected:');
  for (const finding of findings) {
    writeError(`- pattern=${finding.pattern} file=${finding.file}`);
  }
  process.exit(1);
}

write(`No sensitive test output patterns detected in ${files.length} file(s).`);
