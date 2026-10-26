import {
  FILE_ACCESS_TOKEN_COOKIE,
  FileAccessAuthGuard,
  getCookieValue,
} from './fileAccessAuth.guard';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function createGuard(): FileAccessAuthGuard {
  return new FileAccessAuthGuard(
    { checkTokenAuth: jest.fn(), getJwtSecret: jest.fn() } as any,
    { get: jest.fn() } as any,
    {} as any,
    undefined,
  );
}

function extractToken(guard: FileAccessAuthGuard, headers: Record<string, string>): string | null {
  return (guard as any).extractToken({ headers });
}

describe('getCookieValue', () => {
  it('parses the named cookie among multiple entries', () => {
    expect(getCookieValue('a=1; fa_token=jwt.token.value; b=2', 'fa_token')).toBe(
      'jwt.token.value',
    );
  });

  it('keeps base64url payload characters and decodes encoded values', () => {
    expect(getCookieValue('fa_token=abc.def-ghi_jkl', 'fa_token')).toBe('abc.def-ghi_jkl');
    expect(getCookieValue('fa_token=a%3Db', 'fa_token')).toBe('a=b');
  });

  it('returns null for missing, empty or malformed cookies', () => {
    expect(getCookieValue(undefined, 'fa_token')).toBeNull();
    expect(getCookieValue('', 'fa_token')).toBeNull();
    expect(getCookieValue('fa_token=', 'fa_token')).toBeNull();
    expect(getCookieValue('other=value', 'fa_token')).toBeNull();
    expect(getCookieValue('fa_token_extra=value', 'fa_token')).toBeNull();
  });
});

describe('FileAccessAuthGuard token extraction', () => {
  it('prefers the Bearer header over the cookie', () => {
    const guard = createGuard();
    const token = extractToken(guard, {
      authorization: 'Bearer header-token',
      cookie: `${FILE_ACCESS_TOKEN_COOKIE}=cookie-token`,
    });
    expect(token).toBe('header-token');
  });

  it('falls back to the fa_token cookie without a Bearer header', () => {
    const guard = createGuard();
    const token = extractToken(guard, {
      cookie: `other=1; ${FILE_ACCESS_TOKEN_COOKIE}=cookie-token`,
    });
    expect(token).toBe('cookie-token');
  });

  it('returns null when neither header nor cookie carries a token', () => {
    const guard = createGuard();
    expect(extractToken(guard, {})).toBeNull();
    expect(extractToken(guard, { authorization: 'Basic abc' })).toBeNull();
  });
});
