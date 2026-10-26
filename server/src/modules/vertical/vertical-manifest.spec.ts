import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { validateVerticalManifest } from './vertical-manifest';

declare const describe: any;
declare const expect: any;
declare const it: any;

const example = JSON.parse(
  readFileSync(
    path.resolve(
      __dirname,
      '../../../../packages/contracts/fixtures/vertical-manifest.example.json',
    ),
    'utf8',
  ),
);

describe('validateVerticalManifest', () => {
  it('accepts the published example manifest', () => {
    const result = validateVerticalManifest(example);
    expect(result.errors).toEqual([]);
    expect(result.manifest?.name).toBe('latex-bank');
  });

  it('rejects wrong version, bad names, unsafe skill paths and bad config keys', () => {
    const { errors } = validateVerticalManifest({
      manifestVersion: 2,
      name: 'Bad Name',
      site: { configs: { 'bad-key': 1, ok: { nested: true } } },
      mcpServers: [{ url: 'https://x' }],
      sandbox: { skills: ['../escape', '/abs'] },
      extensions: 'nope',
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('manifestVersion'),
        expect.stringContaining('name'),
        expect.stringContaining('site.configs 键不合法：bad-key'),
        expect.stringContaining('site.configs.ok'),
        expect.stringContaining('mcpServers[0] 缺少 name'),
        expect.stringContaining('sandbox.skills[0]'),
        expect.stringContaining('sandbox.skills[1]'),
        expect.stringContaining('extensions'),
      ]),
    );
    expect(validateVerticalManifest('text').errors).toEqual(['清单必须是 JSON 对象']);
  });
});
