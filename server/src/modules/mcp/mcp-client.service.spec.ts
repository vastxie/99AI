import {
  McpClientService,
  normalizeMcpCallToolResult,
  type McpClientFactory,
  type McpConnectedClient,
} from './mcp-client.service';
import { parseMcpServersConfig } from './mcp-config';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;
declare const beforeEach: any;
declare const afterEach: any;

function fakeClient(overrides: Partial<McpConnectedClient> = {}) {
  return {
    listTools: jest.fn().mockResolvedValue({
      tools: [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object' } }],
    }),
    callTool: jest
      .fn()
      .mockResolvedValue({ content: [{ type: 'text', text: 'pong' }], isError: false }),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('normalizeMcpCallToolResult', () => {
  it('joins text and embedded resource text, records media metadata and structured content', () => {
    const normalized = normalizeMcpCallToolResult({
      content: [
        { type: 'text', text: 'line 1' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
        {
          type: 'resource',
          resource: { uri: 'file:///a.txt', text: 'line 2', mimeType: 'text/plain' },
        },
        { type: 'resource_link', uri: 'https://x.example.com', name: 'x' },
        { type: 'unknown' },
      ],
      structuredContent: { total: 2 },
      isError: false,
    });

    expect(normalized).toEqual({
      text: 'line 1\nline 2',
      structured: { total: 2 },
      media: [{ type: 'image', mimeType: 'image/png', bytes: 3, data: 'AAAA' }],
      resources: [
        { uri: 'file:///a.txt', mimeType: 'text/plain' },
        { uri: 'https://x.example.com', name: 'x' },
      ],
      isError: false,
    });
  });

  it('does not accept an unknown result shape and preserves isError', () => {
    expect(normalizeMcpCallToolResult({ toolResult: { ok: 1 }, isError: true })).toEqual({
      text: '',
      media: [],
      resources: [],
      isError: true,
    });
    expect(normalizeMcpCallToolResult(null).text).toBe('');
  });
});

describe('McpClientService', () => {
  const previousEnv = { ...process.env };
  let connect: any;
  let factory: McpClientFactory;
  let service: McpClientService;

  beforeEach(() => {
    delete process.env.MCP_SERVERS_JSON;
    delete process.env.MCP_STDIO_ENABLED;
    delete process.env.MCP_STDIO_COMMAND_ALLOWLIST;
    connect = jest.fn(async () => fakeClient());
    factory = { connect };
  });

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('merges env and global config servers and drops stdio servers that are not allow-listed', async () => {
    process.env.MCP_SERVERS_JSON = JSON.stringify({
      servers: [
        { name: 'env', url: 'https://env.example.com/mcp' },
        { name: 'shared', url: 'https://env-shared.example.com/mcp' },
        { name: 'local', command: 'npx', args: ['server'] },
      ],
    });
    const globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue(
        JSON.stringify({
          mcpServers: { shared: { url: 'https://db-shared.example.com/mcp', enabled: false } },
        }),
      ),
    };
    service = new McpClientService(globalConfigService as any, factory);

    const resolved = await service.resolveServers();

    expect(globalConfigService.getConfigs).toHaveBeenCalledWith(['mcpServers']);
    expect(resolved.servers.map(server => [server.name, server.url, server.enabled])).toEqual([
      ['env', 'https://env.example.com/mcp', true],
      ['shared', 'https://db-shared.example.com/mcp', false],
    ]);
    expect(resolved.errors).toHaveLength(1);
    expect(resolved.errors[0]).toContain('local');
    expect(resolved.errors[0]).toContain('MCP_STDIO_ENABLED');
  });

  it('fails closed without falling back to env when global config cannot be read', async () => {
    process.env.MCP_SERVERS_JSON = JSON.stringify({
      servers: [{ name: 'local', command: '/usr/local/bin/npx', args: ['server'] }],
    });
    process.env.MCP_STDIO_ENABLED = 'true';
    process.env.MCP_STDIO_COMMAND_ALLOWLIST = 'npx';
    service = new McpClientService(
      { getConfigs: jest.fn().mockRejectedValue(new Error('db down')) } as any,
      factory,
    );

    await expect(service.resolveServers()).rejects.toThrow('MCP 配置暂不可用');
    expect(connect).not.toHaveBeenCalled();
  });

  it('connects lazily once per server and caches the tool list until the TTL expires', async () => {
    const server = parseMcpServersConfig({
      servers: [{ name: 'a', url: 'https://a.example.com/mcp', toolsCacheTtlMs: 10_000 }],
    }).servers[0];
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [server] });
    service = new McpClientService(undefined, factory);

    const [first, second] = await Promise.all([
      service.listTools(server),
      service.listTools(server),
    ]);
    const third = await service.listTools(server);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(first).toEqual([{ name: 'echo', description: 'Echo', inputSchema: { type: 'object' } }]);
    expect(second).toBe(first);
    expect(third).toBe(first);
    const client = await connect.mock.results[0].value;
    expect(client.listTools).toHaveBeenCalledTimes(1);
  });

  it('calls tools with the server timeout and drops the connection after a transport failure', async () => {
    const server = parseMcpServersConfig({
      servers: [{ name: 'a', url: 'https://a.example.com/mcp', timeoutMs: 1234 }],
    }).servers[0];
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [server] });
    service = new McpClientService(undefined, factory);

    const result = await service.callTool(server, 'echo', { text: 'ping' });
    expect(result.text).toBe('pong');
    const client = await connect.mock.results[0].value;
    expect(client.callTool).toHaveBeenCalledWith(
      { name: 'echo', arguments: { text: 'ping' } },
      undefined,
      { timeout: 1234 },
    );

    client.callTool.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(service.callTool(server, 'echo', {})).rejects.toThrow('socket hang up');
    expect(client.close).toHaveBeenCalledTimes(1);

    await service.callTool(server, 'echo', {});
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('signals dispatch immediately before invoking the remote SDK call', async () => {
    const order: string[] = [];
    const client = fakeClient({
      callTool: jest.fn(async () => {
        order.push('remote');
        return { content: [{ type: 'text', text: 'pong' }], isError: false };
      }),
    });
    connect.mockResolvedValue(client);
    const server = parseMcpServersConfig({
      servers: [{ name: 'a', url: 'https://a.example.com/mcp' }],
    }).servers[0];
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [server] });
    service = new McpClientService(undefined, factory);

    await service.callTool(server, 'echo', {}, { onDispatch: () => order.push('dispatch') });

    expect(order).toEqual(['dispatch', 'remote']);
  });

  it('passes a signed caller identity through _meta when the server opts in', async () => {
    const server = parseMcpServersConfig({
      servers: [{ name: 'a', url: 'https://a.example.com/mcp', identitySecret: 'shh' }],
    }).servers[0];
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [server] });
    service = new McpClientService(undefined, factory);

    await service.callTool(
      server,
      'echo',
      { text: 'ping' },
      {
        identity: { kind: 'user', id: '7', uid: 'U7', role: 'user' },
      },
    );
    const client = await connect.mock.results[0].value;
    const params = client.callTool.mock.calls[0][0];
    expect(params._meta['99agent/caller']).toEqual(
      expect.objectContaining({ v: 1, kind: 'user', id: '7', uid: 'U7', role: 'user' }),
    );
    expect(params._meta['99agent/caller'].signature).toMatch(/^[0-9a-f]{64}$/);

    const silent = parseMcpServersConfig({
      servers: [{ name: 'a', url: 'https://a.example.com/mcp', passIdentity: false }],
    }).servers[0];
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [silent] });
    await service.callTool(silent, 'echo', {}, { identity: { kind: 'user', id: '7' } });
    expect(client.callTool.mock.calls[1][0]._meta).toBeUndefined();
  });

  it('reconnects when the server configuration changes and closes everything on destroy', async () => {
    const [before] = parseMcpServersConfig({
      servers: [{ name: 'a', url: 'https://a.example.com/mcp' }],
    }).servers;
    const [after] = parseMcpServersConfig({
      servers: [{ name: 'a', url: 'https://a2.example.com/mcp' }],
    }).servers;
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [before] });
    service = new McpClientService(undefined, factory);

    await service.listTools(before);
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [after] });
    await service.listTools(after);
    expect(connect).toHaveBeenCalledTimes(2);
    const firstClient = await connect.mock.results[0].value;
    expect(firstClient.close).toHaveBeenCalledTimes(1);

    await service.onModuleDestroy();
    const secondClient = await connect.mock.results[1].value;
    expect(secondClient.close).toHaveBeenCalledTimes(1);
  });
  it('rejects a revocation while connection establishment is pending', async () => {
    process.env.MCP_SERVERS_JSON = JSON.stringify({
      servers: [{ name: 'a', url: 'https://a.example.invalid/mcp' }],
    });
    const server = parseMcpServersConfig(process.env.MCP_SERVERS_JSON).servers[0];
    const client = fakeClient();
    let finishConnect!: (value: McpConnectedClient) => void;
    let startedConnect: () => void;
    const started = new Promise<void>(resolve => {
      startedConnect = resolve;
    });
    connect.mockImplementation(() => {
      startedConnect();
      return new Promise(resolve => {
        finishConnect = resolve;
      });
    });
    service = new McpClientService(undefined, factory);
    const onDispatch = jest.fn();
    const pendingCall = service.callTool(server, 'echo', {}, { onDispatch });
    await started;
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [{ ...server, enabled: false }] });
    finishConnect(client);
    await expect(pendingCall).rejects.toThrow('配置已变更');
    expect(client.callTool).not.toHaveBeenCalled();
    expect(onDispatch).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('rechecks policy after remote tool discovery and closes a disabled connection', async () => {
    process.env.MCP_SERVERS_JSON = JSON.stringify({
      servers: [{ name: 'a', url: 'https://a.example.invalid/mcp' }],
    });
    const server = parseMcpServersConfig(process.env.MCP_SERVERS_JSON).servers[0];
    const client = fakeClient({
      listTools: jest.fn(async () => {
        process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [{ ...server, enabled: false }] });
        return { tools: [{ name: 'echo' }] };
      }),
    });
    connect.mockResolvedValue(client);
    service = new McpClientService(undefined, factory);
    const onDispatch = jest.fn();
    await expect(service.callTool(server, 'echo', {}, { onDispatch })).rejects.toThrow('不允许');
    expect(client.callTool).not.toHaveBeenCalled();
    expect(onDispatch).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('does not signal dispatch when the remote tool disappears during the final refresh', async () => {
    const server = parseMcpServersConfig({
      servers: [{ name: 'a', url: 'https://a.example.invalid/mcp' }],
    }).servers[0];
    process.env.MCP_SERVERS_JSON = JSON.stringify({ servers: [server] });
    const client = fakeClient({ listTools: jest.fn().mockResolvedValue({ tools: [] }) });
    connect.mockResolvedValue(client);
    service = new McpClientService(undefined, factory);
    const onDispatch = jest.fn();

    await expect(service.callTool(server, 'echo', {}, { onDispatch })).rejects.toThrow(
      'MCP 工具已下线',
    );

    expect(onDispatch).not.toHaveBeenCalled();
    expect(client.callTool).not.toHaveBeenCalled();
  });
});
