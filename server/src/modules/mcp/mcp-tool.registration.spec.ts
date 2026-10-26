import { ToolProviderRegistry } from '../agent/tools/provider-registry/tool-provider.registry';
import { McpToolProvider } from './mcp-tool.provider';
import { McpToolRegistration } from './mcp-tool.registration';

declare const describe: any;
declare const it: any;
declare const expect: any;

describe('McpToolRegistration', () => {
  it('registers the MCP tool provider into the agent registry when the module starts', () => {
    const registry = new ToolProviderRegistry();
    const provider = new McpToolProvider({} as any, {} as any);
    new McpToolRegistration(registry, provider).onModuleInit();
    expect(registry.listToolProviders()).toEqual([
      expect.objectContaining({
        provider: 'McpToolProvider',
        metadata: expect.objectContaining({ displayName: 'MCP 外接工具' }),
      }),
    ]);
  });
});
