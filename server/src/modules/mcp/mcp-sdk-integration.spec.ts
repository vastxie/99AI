/**
 * 用进程内的 Streamable HTTP MCP 服务器验证 SdkMcpClientFactory 与真实 SDK 客户端的集成：
 * 连接、列举、调用、请求头透传、isError 映射与连接关闭。
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpClientService, SdkMcpClientFactory } from './mcp-client.service';
import { verifyMcpCallerMeta } from './mcp-caller-identity';
import { parseMcpServersConfig } from './mcp-config';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const beforeAll: any;
declare const afterAll: any;

let receivedCallerMeta: unknown;

function createTestMcpServer(): Server {
  const mcpServer = new Server(
    { name: 'test-server', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'echo',
        description: 'Echo text back',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
    ],
  }));
  mcpServer.setRequestHandler(CallToolRequestSchema, async request => {
    receivedCallerMeta = request.params._meta?.['99agent/caller'];
    if (request.params.name !== 'echo') {
      return {
        content: [{ type: 'text', text: `unknown tool ${request.params.name}` }],
        isError: true,
      };
    }
    const text = String(request.params.arguments?.text ?? '');
    return {
      content: [{ type: 'text', text: `echo: ${text}` }],
      structuredContent: { length: text.length },
    };
  });
  return mcpServer;
}

describe('MCP SDK integration (in-process Streamable HTTP server)', () => {
  let httpServer: http.Server;
  let url = '';
  let receivedAuthorization: string | undefined;

  beforeAll(async () => {
    // 无会话（stateless）模式下 SDK 要求每个 HTTP 请求使用新的 transport + server 实例
    httpServer = http.createServer((req, res) => {
      receivedAuthorization = req.headers.authorization;
      const mcpServer = createTestMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void mcpServer.close();
      });
      void mcpServer.connect(transport).then(() => transport.handleRequest(req, res));
    });
    await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`;
  });

  afterAll(async () => {
    httpServer.closeAllConnections();
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
  });

  it('lists and calls tools through the real SDK client with configured headers', async () => {
    const [server] = parseMcpServersConfig({
      servers: [
        {
          name: 'local',
          url,
          headers: { Authorization: 'Bearer test-token' },
          identitySecret: 'integration-secret',
          timeoutMs: 5_000,
        },
      ],
    }).servers;

    const service = new McpClientService(
      { getConfigs: async () => JSON.stringify({ servers: [server] }) } as any,
      new SdkMcpClientFactory(),
    );
    try {
      const tools = await service.listTools(server);
      expect(tools).toEqual([
        {
          name: 'echo',
          description: 'Echo text back',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
      ]);
      expect(receivedAuthorization).toBe('Bearer test-token');

      const ok = await service.callTool(
        server,
        'echo',
        { text: 'hi' },
        {
          identity: { kind: 'user', id: '42', uid: 'U42', role: 'user' },
        },
      );
      expect(verifyMcpCallerMeta(receivedCallerMeta, 'integration-secret')).toEqual({
        ok: true,
        identity: { kind: 'user', id: '42', uid: 'U42', role: 'user' },
      });
      expect(ok).toEqual({
        text: 'echo: hi',
        structured: { length: 2 },
        media: [],
        resources: [],
        isError: false,
      });

      await expect(service.callTool(server, 'missing', {})).rejects.toThrow('MCP 工具已下线');
    } finally {
      await service.onModuleDestroy();
    }
  });
});
