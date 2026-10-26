import { AgentToolExecutor } from '../agent/core/agent-tool-executor.adapter';
import { ToolProviderRegistry } from '../agent/tools/provider-registry/tool-provider.registry';
import { McpClientService, type McpConnectedClient } from './mcp-client.service';
import { McpToolProvider } from './mcp-tool.provider';
import { ToolOutcomeUnknownError } from '../agent/tools/tool-provider.interface';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const TOOL_NAME = 'mcp__ops__restart';

function enabledConfig(enabled = true): string {
  return JSON.stringify({
    servers: [{ name: 'ops', url: 'https://ops.example.invalid/mcp', enabled }],
  });
}

function toolContext() {
  return { input: { messages: [], config: {}, context: { options: {} } } } as any;
}

describe('MCP durable operation effect boundary', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  async function createHarness(client: McpConnectedClient) {
    process.env.MCP_SERVERS_JSON = enabledConfig();
    delete process.env.MCP_STDIO_ENABLED;
    delete process.env.MCP_STDIO_COMMAND_ALLOWLIST;
    const mcpClient = new McpClientService(undefined, {
      connect: jest.fn().mockResolvedValue(client),
    });
    const provider = new McpToolProvider(mcpClient, {} as any);
    await provider.getToolDefinitions(toolContext());
    const registry = new ToolProviderRegistry();
    registry.register(provider, {
      category: 'productivity',
      displayName: 'MCP',
      description: 'MCP',
    });
    const executor = new AgentToolExecutor({ toolProviderRegistry: registry });
    const operationSession = {
      beginToolEffect: jest.fn().mockResolvedValue({ action: 'execute', effectKey: 'tool:r0:o0' }),
      commitToolEffect: jest.fn().mockResolvedValue(undefined),
      markToolEffectInterrupted: jest.fn().mockResolvedValue(undefined),
      markToolEffectUnknown: jest.fn().mockResolvedValue(undefined),
    };
    return { executor, operationSession };
  }

  async function execute(executor: AgentToolExecutor, operationSession: any) {
    return executor.executeToolCalls({
      toolCalls: [
        {
          id: 'call_mcp_restart',
          type: 'function',
          function: { name: TOOL_NAME, arguments: '{}' },
        },
      ],
      toolContext: toolContext(),
      sanitizedNameMap: new Map([[TOOL_NAME, TOOL_NAME]]),
      options: { toolCost: 0 },
      currentRoundIndex: 0,
      operationSession,
    });
  }

  it.each(['configuration disabled', 'tool removed'])(
    'keeps %s during the final client preflight definite',
    async (scenario: string) => {
      let listCalls = 0;
      const remoteCall = jest.fn();
      const client: McpConnectedClient = {
        listTools: jest.fn(async () => {
          listCalls += 1;
          if (listCalls === 3 && scenario === 'configuration disabled') {
            process.env.MCP_SERVERS_JSON = enabledConfig(false);
          }
          return {
            tools:
              listCalls === 3 && scenario === 'tool removed'
                ? []
                : [{ name: 'restart', inputSchema: { type: 'object' } }],
          };
        }),
        callTool: remoteCall,
        close: jest.fn().mockResolvedValue(undefined),
      };
      const { executor, operationSession } = await createHarness(client);

      const [result] = await execute(executor, operationSession);

      expect(result.status).toBe('error');
      expect(listCalls).toBe(3);
      expect(remoteCall).not.toHaveBeenCalled();
      expect(operationSession.commitToolEffect).toHaveBeenCalledWith(
        'tool:r0:o0',
        expect.objectContaining({ status: 'error' }),
      );
      expect(operationSession.markToolEffectUnknown).not.toHaveBeenCalled();
    },
  );

  it('marks a rejection after the real remote dispatch boundary unknown exactly once', async () => {
    const privateDetail = 'synthetic remote transport diagnostic';
    const remoteCall = jest.fn().mockRejectedValue(new Error(privateDetail));
    const client: McpConnectedClient = {
      listTools: jest.fn().mockResolvedValue({
        tools: [{ name: 'restart', inputSchema: { type: 'object' } }],
      }),
      callTool: remoteCall,
      close: jest.fn().mockResolvedValue(undefined),
    };
    const { executor, operationSession } = await createHarness(client);

    let caught: unknown;
    try {
      await execute(executor, operationSession);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ToolOutcomeUnknownError);
    expect((caught as Error).message).not.toContain(privateDetail);
    expect(remoteCall).toHaveBeenCalledTimes(1);
    expect(operationSession.markToolEffectUnknown).toHaveBeenCalledTimes(1);
    expect(operationSession.markToolEffectUnknown).toHaveBeenCalledWith('tool:r0:o0');
    expect(operationSession.commitToolEffect).not.toHaveBeenCalled();
  });
});
