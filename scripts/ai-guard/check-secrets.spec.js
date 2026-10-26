'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { scanContent } = require('./check-secrets');

describe('ai-guard tracked secret scanner', () => {
  it('rejects private PEM, raw symmetric key and segmented-key JSON fixtures', () => {
    assert.notEqual(
      scanContent(
        'tmp/private.pem',
        '-----BEGIN PRIVATE KEY-----\nsynthetic-private-material\n-----END PRIVATE KEY-----',
      ).length,
      0,
    );
    assert.notEqual(scanContent('tmp/aes.key', '0123456789abcdef0123456789abcdef').length, 0);
    assert.notEqual(
      scanContent(
        'tmp/key-segments.json',
        JSON.stringify({ segments: ['synthetic-segment-one', 'synthetic-segment-two'] }),
      ).length,
      0,
    );
  });

  it('allows placeholders and public-only PEM material', () => {
    assert.deepEqual(scanContent('tmp/aes.key', 'change_me_in_secret_manager'), []);
    assert.deepEqual(
      scanContent(
        'tmp/public.pem',
        '-----BEGIN PUBLIC KEY-----\nsynthetic-public-material\n-----END PUBLIC KEY-----',
      ),
      [],
    );
  });

  // 合成样例由片段拼接，避免本文件自身被当成密钥（本文件也在白名单里）
  const body36 = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
  const names = (content) => scanContent('src/app.ts', content).map((item) => item.name);

  it('reports vendor-prefixed tokens even though they look like identifiers', () => {
    assert.deepEqual(names(`const token = '${'ghp_'}${body36}';`), ['GitHub token']);
    assert.deepEqual(names(`GH=${'github_pat_'}${body36}_${body36}`), ['GitHub token']);
    assert.deepEqual(names(`key=${'AKIA'}Q7W3E9R2T5Y8U1I4`), ['AWS access key']);
    assert.deepEqual(names(`key=${'ASIA'}Q7W3E9R2T5Y8U1I4`), ['AWS access key']);
    assert.deepEqual(names(`STRIPE=${'sk_live_'}${body36}`), ['Stripe live key']);
    assert.deepEqual(names(`STRIPE=${'rk_live_'}${body36}`), ['Stripe live key']);
    assert.deepEqual(names(`HOOK=${'whsec_'}${body36}`), ['Stripe webhook secret']);
  });

  it('skips vendor placeholders and test-mode keys', () => {
    assert.deepEqual(names(`${'ghp_'}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`), []);
    assert.deepEqual(names(`${'AKIA'}IOSFODNN7EXAMPLE`), []);
    assert.deepEqual(names(`${'sk_live_'}your_key_here_replace_me_now`), []);
    assert.deepEqual(names(`${'sk_test_'}${body36}`), []);
  });

  it('checks every match on a line and keeps lines independent', () => {
    // 同一行先占位、后真值：第二个照样报
    assert.deepEqual(names(`a=${'ghp_'}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx b=${'ghp_'}${body36}`), [
      'GitHub token',
    ]);
    assert.deepEqual(names(`a=${'ghp_'}${body36} b=${'gho_'}${body36}`), [
      'GitHub token',
      'GitHub token',
    ]);
    const lines = [`x=${'AKIA'}Q7W3E9R2T5Y8U1I4`, 'nothing here', `y=${'AKIA'}Z7W3E9R2T5Y8U1I4`];
    assert.deepEqual(
      scanContent('src/app.ts', lines.join('\n')).map((item) => item.line),
      [1, 3],
    );
  });

  it('reports single-line private keys and ignores code templates', () => {
    const material = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7'.repeat(2);
    const begin = '-----BEGIN ' + 'PRIVATE KEY-----';
    assert.deepEqual(names(`{"key":"${begin}\\n${material}"}`), ['private key block']);
    assert.deepEqual(names(`KEY="${begin}\\\\n${material}"`), ['private key block']);
    assert.deepEqual(names(`const pem = \`${begin}\\n\${formatted}\\n-----END\`;`), []);
  });

  it('keeps the workflow on pull requests and pushes with a full tracked-tree scan', () => {
    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../.github/workflows/source-secrets.yml'),
      'utf8',
    );
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /push:/);
    assert.ok(workflow.includes('node scripts/ai-guard/check-secrets.js --all'));
  });
});
