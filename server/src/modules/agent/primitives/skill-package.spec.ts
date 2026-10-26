import { createHash } from 'node:crypto';
import { decodeSkillPackage, encodeSkillPackage, skillSourcePath } from './skill-package';
declare const describe: any, it: any, expect: any;
const file = (path: string, text: string) => ({
  path,
  content: Buffer.from(text).toString('base64'),
  sha256: createHash('sha256').update(text).digest('hex'),
});
describe('private skill source packages', () => {
  it('round-trips bounded source and verifies the content digest', () => {
    const encoded = encodeSkillPackage('demo', [
      file('SKILL.md', '# Demo'),
      file('scripts/run.py', 'print(1)'),
    ]);
    expect(decodeSkillPackage(encoded).files[1].buffer.toString()).toBe('print(1)');
    const tampered = JSON.parse(encoded.toString());
    tampered.files[1].content = Buffer.from('changed').toString('base64');
    expect(() => decodeSkillPackage(Buffer.from(JSON.stringify(tampered)))).toThrow('校验失败');
  });
  it.each([
    '../SKILL.md',
    '/workspace/SKILL.md',
    '.env',
    '.git/config',
    'node_modules/x.js',
    'venv/a.py',
    'in/user.txt',
    'private_key.json',
    'a.png',
  ])('rejects unsafe or non-source path %s', (path: string) => {
    expect(() => skillSourcePath(path)).toThrow();
  });
  it('rejects missing entry point, duplicates, excessive count and oversized content', () => {
    expect(() => encodeSkillPackage('demo', [file('run.py', 'x')])).toThrow();
    expect(() =>
      encodeSkillPackage('demo', [file('SKILL.md', 'x'), file('SKILL.md', 'x')]),
    ).toThrow();
    expect(() =>
      encodeSkillPackage(
        'demo',
        Array.from({ length: 101 }, (_, i) => file(`${i}.py`, 'x')),
      ),
    ).toThrow();
    expect(() =>
      encodeSkillPackage('demo', [file('SKILL.md', 'x'.repeat(256 * 1024 + 1))]),
    ).toThrow();
  });
});
