import * as fs from 'fs';
import * as path from 'path';

declare const describe: any;
declare const expect: any;
declare const it: any;

function walk(directory: string, out: string[] = []): string[] {
  if (!fs.existsSync(directory)) return out;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(path.relative(process.cwd(), full));
  }
  return out;
}

describe('sensitive log source scan', () => {
  const root = process.cwd();
  /**
   * 内核与所有扩展包的服务 / 适配器（目录扫描：新增文件自动纳入，包删掉即不再检查）。
   * 验证码、凭据、第三方身份都经这些文件流转，不点名任何一个文件。
   */
  const targetFiles = ['src/modules', 'src/common', 'src/packs']
    .flatMap(dir => walk(path.join(root, dir)))
    .filter(file => /\.(service|provider)\.ts$/.test(file) && !file.endsWith('.spec.ts'));
  const forbiddenPatterns = [
    /输入的验证码/,
    /期望的验证码/,
    /Retrieved redisCode/,
    /\[开发模式\]\s*(手机)?验证码/,
    /完整Access Token前10位/,
    /accessToken\.substring\(0,\s*10\)/,
    // 原始 OpenID / UnionID 直接进日志（脱敏函数调用带括号，不会命中）
    /OpenID:\s*\$\{[\w.]*(?:openId|openID|openid)\}/,
    /UnionID:\s*\$\{[\w.]*(?:unionId|unionid)\}/,
  ];

  it('does not contain known raw verification code or third-party identity log patterns', () => {
    // 扫描集不能为空，且必须覆盖内核里处理验证码 / 凭据的服务
    expect(targetFiles).toEqual(
      expect.arrayContaining([
        'src/modules/auth/auth.service.ts',
        'src/modules/user/user.service.ts',
      ]),
    );
    for (const file of targetFiles) {
      const content = fs.readFileSync(path.join(root, file), 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
