import * as path from 'node:path';
import {
  capFaithfulText,
  isFaithfulTextTool,
  sanitizeFaithfulText,
  sliceUtf16,
  sliceUtf16From,
} from './faithful-text';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('faithful model text for primitive tools', () => {
  const env = {
    JWT_SECRET: 'jwt-secret-value-0123456789',
    DB_PASS: 'database-password-01',
    REDIS_PASS: 'short',
    PAYMENT_API_KEY: '123456789012',
    MAX_TOKENS: '12345678',
    TOKENIZER_MODEL: 'cl100k_base',
    DATABASE_URL: 'mysql://agent:url-password-01@db.internal:3306/agent',
    SANDBOX_USER_DISK_ROOT: '/var/lib/99agent/sandbox-disks',
  } as NodeJS.ProcessEnv;

  it('keeps code, HTML, whitespace and log lines exactly as written', () => {
    const source = [
      'function cmp(a, b, c, d) {',
      '  if (a < b && c > d) {',
      '\treturn a; // <b>not html</b>',
      '  }',
      '}',
      '<!doctype html><div class="x">Hello</div>',
      'stack: Error: boom',
      '    at main (app.js:1:1)',
      'stdout: kept',
      'file_path = "/workspace/data.csv"',
      'api_key = os.environ["OPENAI_API_KEY"]',
      '',
    ].join('\n');
    expect(sanitizeFaithfulText(source, env)).toBe(source);
  });

  it('removes internal file links including their query and fragment', () => {
    const text = [
      'a https://agent.example.com/api/files/file_abc/download?token=SECRET#frag b',
      'c /api/files/file_abc/preview?sig=1 d',
      'e api/files/file_abc/download f',
    ].join('\n');
    const sanitized = sanitizeFaithfulText(text, env);
    expect(sanitized).toBe(
      ['a [内部文件链接] b', 'c [内部文件链接] d', 'e [内部文件链接] f'].join('\n'),
    );
  });

  it('removes the whole query even with parentheses and keeps a Markdown link closed', () => {
    const text =
      '[下载](https://host.example/api/files/file_abc/download?x=(one)&signature=SECRET#frag) 结束';
    expect(sanitizeFaithfulText(text, env)).toBe('[下载]([内部文件链接]) 结束');
  });

  it('removes the whole query with nested parentheses', () => {
    const text = 'see https://h.example/api/files/file_abc/preview?x=((a))&signature=S#frag ok';
    expect(sanitizeFaithfulText(text, env)).toBe('see [内部文件链接] ok');
    expect(sanitizeFaithfulText('[a](/api/files/file_abc/download?q=(x(y))&sig=S) tail', env)).toBe(
      '[a]([内部文件链接]) tail',
    );
  });

  it('ends the query at inline code backticks and at following Chinese text', () => {
    expect(sanitizeFaithfulText('`/api/files/file_probe/download?x=(a`正文', env)).toBe(
      '`[内部文件链接]`正文',
    );
    expect(sanitizeFaithfulText('见 /api/files/file_x/download?a=1&b=2，然后继续', env)).toBe(
      '见 [内部文件链接]，然后继续',
    );
  });

  it('keeps whitespace-only text', () => {
    expect(sanitizeFaithfulText(' \t\n', env)).toBe(' \t\n');
  });

  it('replaces only real FileAsset ids', () => {
    const id = `file_${'A1b2C3d4'.repeat(3)}`;
    expect(sanitizeFaithfulText(`ref ${id} and file_path and file_${'x'.repeat(25)}`, env)).toBe(
      `ref [private-file] and file_path and file_${'x'.repeat(25)}`,
    );
  });

  it('replaces long secret values (digits too) and credential URLs, not short or non-secret ones', () => {
    const text = [
      'JWT_SECRET=jwt-secret-value-0123456789',
      'DB_PASS=database-password-01',
      'REDIS_PASS=short',
      'PAYMENT_API_KEY=123456789012',
      'MAX_TOKENS=12345678',
      'TOKENIZER_MODEL=cl100k_base',
      'DATABASE_URL=mysql://agent:url-password-01@db.internal:3306/agent',
    ].join('\n');
    expect(sanitizeFaithfulText(text, env)).toBe(
      [
        'JWT_SECRET=[平台密钥]',
        'DB_PASS=[平台密钥]',
        'REDIS_PASS=short',
        'PAYMENT_API_KEY=[平台密钥]',
        'MAX_TOKENS=12345678',
        'TOKENIZER_MODEL=cl100k_base',
        'DATABASE_URL=[平台密钥]',
      ].join('\n'),
    );
  });

  it('replaces configured roots on path boundaries only', () => {
    const roots = { SANDBOX_SITE_SKILLS_DIR: '/srv' } as NodeJS.ProcessEnv;
    expect(sanitizeFaithfulText('/srv/skills/a and /srvx/b and /srv', roots)).toBe(
      '[站点技能目录]/skills/a and /srvx/b and [站点技能目录]',
    );
    const app = { SANDBOX_SITE_SKILLS_DIR: '/srv/app' } as NodeJS.ProcessEnv;
    expect(sanitizeFaithfulText('/srv/app/x.ts and /srv/application/main.ts', app)).toBe(
      '[站点技能目录]/x.ts and /srv/application/main.ts',
    );
    // 左右都按完整路径边界：别的目录名或更深的路径里出现同样的字串都不改
    for (const kept of [
      '/srv/app中文/a.txt',
      '/srv/app+suffix/a.txt',
      '/workspace/srv/app/a.txt',
    ]) {
      expect(sanitizeFaithfulText(kept, app)).toBe(kept);
    }
    expect(sanitizeFaithfulText('ROOT=/srv/app; cd "/srv/app"', app)).toBe(
      'ROOT=[站点技能目录]; cd "[站点技能目录]"',
    );
  });

  it('replaces known host paths', () => {
    const cwd = process.cwd();
    const text = `${path.join(cwd, 'data/sandboxes/x')} and /var/lib/99agent/sandbox-disks/site/mnt`;
    expect(sanitizeFaithfulText(text, env)).toBe(
      '[服务端目录]/data/sandboxes/x and [用户磁盘目录]/site/mnt',
    );
  });

  it('cuts by UTF-16 length without splitting surrogate pairs', () => {
    const text = 'ab😀cd';
    expect(sliceUtf16(text, 3)).toBe('ab');
    expect(sliceUtf16(text, 4)).toBe('ab😀');
    expect(sliceUtf16From(text, 3)).toBe('cd');
    expect(sliceUtf16From(text, 2)).toBe('😀cd');
  });

  it('drops the middle when over the limit and keeps the ending notes', () => {
    const text = `${'头'.repeat(2000)}${'中'.repeat(20000)}${'尾'.repeat(2000)}\n[已交付给用户的文件]`;
    const capped = capFaithfulText(text, 12000);
    expect(capped.length).toBeLessThanOrEqual(12000);
    expect(capped.startsWith('头')).toBe(true);
    expect(capped.endsWith('[已交付给用户的文件]')).toBe(true);
    expect(capped).toContain('超出单条结果上限');
    expect(capFaithfulText('short', 12000)).toBe('short');
  });

  it('only treats primitive tool names as faithful', () => {
    for (const name of ['read', 'write', 'edit', 'bash', 'ls']) {
      expect(isFaithfulTextTool(name)).toBe(true);
    }
    for (const name of ['mcp__files__read', 'web_search', 'Read', '', undefined]) {
      expect(isFaithfulTextTool(name)).toBe(false);
    }
  });
});
