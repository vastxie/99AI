import {
  createOpaqueModelGatewaySessionId,
  initializeModelGatewaySessionSecret,
} from './model-gateway-session';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('createOpaqueModelGatewaySessionId', () => {
  it('keeps a scope stable without exposing predictable internal ids', () => {
    initializeModelGatewaySessionSecret('fixture-local-service-secret-at-least-32-bytes');
    const first = createOpaqueModelGatewaySessionId('group:42');
    const repeated = createOpaqueModelGatewaySessionId('group:42');

    expect(first).toBe(repeated);
    expect(first).toMatch(/^99agent-[a-f0-9]{32}$/);
    expect(first).not.toContain('42');
    expect(first).not.toContain('group');
  });

  it('separates different scopes', () => {
    expect(createOpaqueModelGatewaySessionId('group:42')).not.toBe(
      createOpaqueModelGatewaySessionId('group:43'),
    );
  });

  it('rejects a short local service secret', () => {
    expect(() => initializeModelGatewaySessionSecret('short')).toThrow(
      '模型网关会话密钥至少 32 个字节',
    );
  });
});
