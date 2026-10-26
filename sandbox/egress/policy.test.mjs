import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicIPv4, resolveTarget, forwardingHeaders } from './policy.mjs';
const publicDNS = async () => [{ address: '93.184.216.34' }];
test('rejects non-public, special encodings, credentials and wrong ports', async () => {
  for (const ip of [
    '0.0.0.0',
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.17.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '198.18.1.1',
    '224.1.1.1',
    '255.255.255.255',
    '::1',
    '::ffff:8.8.8.8',
  ])
    assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('8.8.8.8'), true);
  for (const value of [
    'http://127.1/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://[::1]/',
    'http://user:pass@example.com/',
    'http://example.com:8080/',
    'ftp://example.com/',
    'http://example.com/#x',
    'http://example.com\\@127.0.0.1/',
  ])
    await assert.rejects(resolveTarget(value, { resolve: publicDNS }), undefined, value);
  for (const value of [
    'example.com:80',
    '[::1]:443',
    'example.com:443/path',
    'user@example.com:443',
  ])
    await assert.rejects(resolveTarget(value, { tunnel: true, resolve: publicDNS }));
});
test('DNS is resolved once and all answers must be public', async () => {
  let calls = 0;
  const target = await resolveTarget('example.com:443', {
    tunnel: true,
    resolve: async () => {
      calls++;
      return publicDNS();
    },
  });
  assert.equal(calls, 1);
  assert.equal(target.address, '93.184.216.34');
  assert.equal(target.port, 443);
  await assert.rejects(
    resolveTarget('http://example.com/', {
      resolve: async () => [{ address: '93.184.216.34' }, { address: '10.0.0.1' }],
    }),
  );
});
test('host allow/deny lists cover subdomains and pinned addresses', async () => {
  await assert.rejects(
    resolveTarget('http://github.com/', {
      env: { EGRESS_ALLOW_HOSTS: 'pypi.org' },
      resolve: publicDNS,
    }),
  );
  await assert.rejects(
    resolveTarget('http://api.example.com/', {
      env: { EGRESS_DENY_HOSTS: 'example.com' },
      resolve: publicDNS,
    }),
  );
  await assert.rejects(
    resolveTarget('http://example.com/', {
      env: { EGRESS_DENY_HOSTS: '93.184.216.34' },
      resolve: publicDNS,
    }),
  );
  assert.equal(
    (
      await resolveTarget('http://files.pythonhosted.org/', {
        env: { EGRESS_ALLOW_HOSTS: 'pythonhosted.org' },
        resolve: publicDNS,
      })
    ).port,
    80,
  );
});
test('does not forward proxy credentials and connection-nominated headers', () => {
  assert.deepEqual(
    forwardingHeaders({
      host: 'example.com',
      'proxy-authorization': 'synthetic',
      connection: 'x-hidden, keep-alive',
      'x-hidden': 'synthetic',
      authorization: 'target-only',
    }),
    { host: 'example.com', authorization: 'target-only' },
  );
});
