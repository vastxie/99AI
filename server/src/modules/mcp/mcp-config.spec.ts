import {
  buildMcpToolName,
  isMcpStdioCommandAllowed,
  sanitizeMcpStdioEnv,
  isMcpToolAllowed,
  isMcpToolName,
  MCP_DEFAULT_TIMEOUT_MS,
  MCP_MAX_TOOL_NAME_LENGTH,
  mergeMcpServerConfigs,
  parseMcpServersConfig,
  readMcpStdioPolicy,
} from './mcp-config';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('parseMcpServersConfig identity options', () => {
  it('defaults passIdentity to true and keeps a trimmed identitySecret', () => {
    const { servers } = parseMcpServersConfig({
      servers: [
        { name: 'a', url: 'https://a.example.com/mcp' },
        { name: 'b', url: 'https://b.example.com/mcp', passIdentity: false, identitySecret: ' k ' },
      ],
    });
    expect(servers[0].passIdentity).toBe(true);
    expect(servers[0].identitySecret).toBeUndefined();
    expect(servers[1].passIdentity).toBe(false);
    expect(servers[1].identitySecret).toBe('k');
  });
});

describe('parseMcpServersConfig', () => {
  it('returns nothing for empty input without errors', () => {
    expect(parseMcpServersConfig(undefined)).toEqual({ servers: [], errors: [] });
    expect(parseMcpServersConfig('')).toEqual({ servers: [], errors: [] });
    expect(parseMcpServersConfig('   ')).toEqual({ servers: [], errors: [] });
  });

  it('parses the servers array shape with defaults applied', () => {
    const result = parseMcpServersConfig(
      JSON.stringify({
        servers: [
          {
            name: 'Docs',
            url: 'https://mcp.example.com/mcp',
            headers: { Authorization: 'Bearer token' },
            tools: { allow: ['search_*'], deny: ['search_secret'] },
          },
        ],
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.servers).toEqual([
      {
        name: 'docs',
        transport: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer token' },
        enabled: true,
        tools: { allow: ['search_*'], deny: ['search_secret'] },
        timeoutMs: MCP_DEFAULT_TIMEOUT_MS,
        toolsCacheTtlMs: 60_000,
        passIdentity: true,
      },
    ]);
  });

  it('parses the Claude Desktop style mcpServers object shape', () => {
    const result = parseMcpServersConfig({
      mcpServers: {
        fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/data'] },
        remote: { type: 'streamable-http', url: 'http://localhost:3001/mcp', timeoutMs: '5000' },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.servers.map(server => [server.name, server.transport])).toEqual([
      ['fs', 'stdio'],
      ['remote', 'http'],
    ]);
    expect(result.servers[0].command).toBe('npx');
    expect(result.servers[0].args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
      '/data',
    ]);
    expect(result.servers[1].timeoutMs).toBe(5000);
  });

  it('collects per-entry errors while keeping valid entries', () => {
    const result = parseMcpServersConfig({
      servers: [
        { name: 'Bad Name!', url: 'https://a.example.com/mcp' },
        { name: 'nourl' },
        { name: 'ftp', url: 'ftp://a.example.com' },
        { name: 'weird', transport: 'websocket', url: 'https://a.example.com' },
        { name: 'ok', url: 'https://a.example.com/mcp' },
        { name: 'ok', url: 'https://b.example.com/mcp' },
      ],
    });

    expect(result.servers.map(server => server.name)).toEqual(['ok']);
    expect(result.servers[0].url).toBe('https://a.example.com/mcp');
    expect(result.errors).toHaveLength(5);
    expect(result.errors.join('\n')).toContain('不合法');
    expect(result.errors.join('\n')).toContain('重复');
  });

  it('reports invalid JSON and wrong container shapes', () => {
    expect(parseMcpServersConfig('{oops').errors[0]).toContain('不是合法 JSON');
    expect(parseMcpServersConfig({ foo: 1 }).errors[0]).toContain('缺少 servers');
    expect(parseMcpServersConfig(42).errors[0]).toContain('必须是 JSON 对象或数组');
  });
});

describe('mergeMcpServerConfigs', () => {
  it('lets the override win by name and keeps the rest', () => {
    const base = parseMcpServersConfig({
      servers: [
        { name: 'a', url: 'https://a.example.com/mcp' },
        { name: 'b', url: 'https://b.example.com/mcp' },
      ],
    }).servers;
    const override = parseMcpServersConfig({
      servers: [{ name: 'b', url: 'https://b2.example.com/mcp', enabled: false }],
    }).servers;

    const merged = mergeMcpServerConfigs(base, override);
    expect(merged.map(server => [server.name, server.url, server.enabled])).toEqual([
      ['a', 'https://a.example.com/mcp', true],
      ['b', 'https://b2.example.com/mcp', false],
    ]);
  });
});

describe('tool filters and names', () => {
  const server = parseMcpServersConfig({
    servers: [
      {
        name: 'svc',
        url: 'https://svc.example.com/mcp',
        tools: { allow: ['read_*', 'echo'], deny: ['read_secret'] },
      },
    ],
  }).servers[0];

  it('applies deny before allow and supports trailing wildcards', () => {
    expect(isMcpToolAllowed(server, 'read_file')).toBe(true);
    expect(isMcpToolAllowed(server, 'echo')).toBe(true);
    expect(isMcpToolAllowed(server, 'read_secret')).toBe(false);
    expect(isMcpToolAllowed(server, 'write_file')).toBe(false);
    expect(isMcpToolAllowed({ ...server, tools: undefined }, 'write_file')).toBe(true);
  });

  it('builds prefixed, sanitized and length-capped tool names', () => {
    expect(buildMcpToolName('svc', 'read_file')).toBe('mcp__svc__read_file');
    expect(buildMcpToolName('svc', 'read.file/v2')).toMatch(
      /^mcp__svc__read_file_v2_[0-9a-f]{6}$/u,
    );

    const longName = 'x'.repeat(100);
    const capped = buildMcpToolName('svc', longName);
    expect(capped.length).toBeLessThanOrEqual(MCP_MAX_TOOL_NAME_LENGTH);
    expect(capped).not.toBe(buildMcpToolName('svc', `${longName}y`));
    expect(isMcpToolName(capped)).toBe(true);
    expect(isMcpToolName('web_search')).toBe(false);
  });
});

describe('stdio policy', () => {
  it('denies stdio unless explicitly enabled with an allowlist', () => {
    expect(isMcpStdioCommandAllowed(readMcpStdioPolicy({}), 'npx')).toBe(false);
    expect(isMcpStdioCommandAllowed(readMcpStdioPolicy({ MCP_STDIO_ENABLED: 'true' }), 'npx')).toBe(
      false,
    );

    const policy = readMcpStdioPolicy({
      MCP_STDIO_ENABLED: 'true',
      MCP_STDIO_COMMAND_ALLOWLIST: 'npx, /usr/local/bin/mcp-server',
    });
    // 只按文件名放行的项（npx）不再生效：放行项与命令都必须是绝对路径且精确相同
    expect(isMcpStdioCommandAllowed(policy, 'npx')).toBe(false);
    expect(isMcpStdioCommandAllowed(policy, '/opt/node/bin/npx')).toBe(false);
    expect(isMcpStdioCommandAllowed(policy, '/usr/local/bin/mcp-server')).toBe(true);
    expect(isMcpStdioCommandAllowed(policy, '/tmp/mcp-server')).toBe(false);
    expect(isMcpStdioCommandAllowed(policy, 'bash')).toBe(false);
  });

  it('drops interpreter-hijacking variables from configured stdio env', () => {
    expect(
      sanitizeMcpStdioEnv({
        NODE_OPTIONS: '--require /tmp/x.js',
        LD_PRELOAD: '/tmp/x.so',
        DYLD_INSERT_LIBRARIES: '/tmp/x.dylib',
        PATH: '/tmp',
        API_TOKEN: 'abc',
      }),
    ).toEqual({ API_TOKEN: 'abc' });
    expect(sanitizeMcpStdioEnv(undefined)).toEqual({});
  });

  it('rejects http servers pointing at cloud metadata endpoints', () => {
    const result = parseMcpServersConfig({
      servers: [
        { name: 'meta', url: 'http://169.254.169.254/latest/mcp' },
        { name: 'ok', url: 'https://mcp.example.com/mcp' },
      ],
    });
    expect(result.servers.map(server => server.name)).toEqual(['ok']);
    expect(result.errors.join(' ')).toContain('元数据');
  });
});
