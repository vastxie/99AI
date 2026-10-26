import {
  MCP_CALLER_META_TTL_MS,
  buildMcpCallerMeta,
  readMcpCallerIdentity,
  verifyMcpCallerMeta,
} from './mcp-caller-identity';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('MCP caller identity', () => {
  it('reads user or visitor identity from tool context options', () => {
    expect(readMcpCallerIdentity({ userId: 12, uid: 'U00012', userRole: 'user' })).toEqual({
      kind: 'user',
      id: '12',
      uid: 'U00012',
      role: 'user',
    });
    expect(readMcpCallerIdentity({ visitorId: 'v-abc' })).toEqual({
      kind: 'visitor',
      id: 'v-abc',
      role: 'visitor',
    });
    expect(readMcpCallerIdentity({})).toBeUndefined();
    expect(readMcpCallerIdentity(undefined)).toBeUndefined();
  });

  it('signs with the shared secret and verifies within the ttl', () => {
    const now = 1_700_000_000_000;
    const meta = buildMcpCallerMeta(
      { kind: 'user', id: '7', uid: 'U7', role: 'user' },
      's3cret',
      now,
    );
    expect(meta.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.expiresAt).toBe(now + MCP_CALLER_META_TTL_MS);

    expect(verifyMcpCallerMeta(meta, 's3cret', now + 1000)).toEqual({
      ok: true,
      identity: { kind: 'user', id: '7', uid: 'U7', role: 'user' },
    });
    expect(verifyMcpCallerMeta(meta, 'other', now)).toEqual({ ok: false, reason: 'bad-signature' });
    expect(verifyMcpCallerMeta({ ...meta, id: '8' }, 's3cret', now)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    expect(verifyMcpCallerMeta(meta, 's3cret', meta.expiresAt + 1)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('passes identity without a signature when no secret is configured', () => {
    const meta = buildMcpCallerMeta({ kind: 'visitor', id: 'v1', role: 'visitor' });
    expect(meta.signature).toBeUndefined();
    expect(verifyMcpCallerMeta(meta, 'any')).toEqual({ ok: false, reason: 'unsigned' });
    expect(verifyMcpCallerMeta(undefined, 'any')).toEqual({ ok: false, reason: 'missing' });
    expect(verifyMcpCallerMeta('nope', 'any')).toEqual({ ok: false, reason: 'malformed' });
  });
});
