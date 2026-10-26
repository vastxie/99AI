import 'reflect-metadata';
import { existsSync } from 'fs';
import { join } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { McpModule } from '../mcp/mcp.module';
import { McpToolRegistration } from '../mcp/mcp-tool.registration';
import { AgentModule } from './agent.module';

declare const describe: any;
declare const expect: any;
declare const it: any;

function providerNames(): string[] {
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AgentModule) || [];
  return providers.map((provider: any) => {
    if (typeof provider === 'function') return provider.name;
    const token = provider?.provide;
    if (typeof token === 'function') return token.name;
    return String(token || provider);
  });
}

function importNames(): string[] {
  const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentModule) || [];
  return imports.map((entry: any) => entry?.name || entry?.module?.name || String(entry));
}

describe('AgentModule production execution providers', () => {
  it('does not register legacy BaseNode providers in the production module', () => {
    const names = providerNames();
    for (const name of ['ToolLoopNode', 'EndNode', 'SensitiveFilterNode']) {
      expect(names).not.toContain(name);
    }
  });

  it('does not keep legacy node source files in the production agent tree', () => {
    const legacyPaths = [
      'core/BaseNode.ts',
      'core/NodeInterface.ts',
      'core/types.ts',
      'nodes/EndNode.ts',
      'nodes/SensitiveFilterNode.ts',
    ];

    for (const legacyPath of legacyPaths) {
      expect(existsSync(join(__dirname, legacyPath))).toBe(false);
    }
  });

  it('keeps AgentLoopService as the production execution harness', () => {
    expect(providerNames()).toContain('AgentLoopService');
    expect(providerNames()).toContain('ContextCheckpointCoordinator');
    expect(importNames()).toContain('AgentRuntimeStateModule');
    expect(importNames()).toContain('ContextCheckpointModule');
  });

  it('does not register pure context assemblers as Nest providers', () => {
    expect(providerNames()).not.toContain('AgentAppContextAssembler');
  });

  it('wires the sandbox primitives and MCP as capability providers, plus conversation controls', () => {
    expect(importNames()).not.toContain('PluginHostModule');
    expect(importNames()).toContain('SandboxModule');
    // MCP 由 McpModule 初始化时注册进 ToolProviderRegistry，agent 不导入 mcp
    expect(importNames()).not.toContain('McpModule');
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, McpModule)).toContain(AgentModule);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, McpModule)).toContain(
      McpToolRegistration,
    );
    expect(providerNames()).not.toContain('PluginAgentAppProvider');
    expect(providerNames()).not.toContain('BuiltInAgentAppProvider');
    expect(providerNames()).toContain('PrimitiveToolProvider');
    // 会话控制工具只决定呈现与提问，不提供外部能力
    expect(providerNames()).toContain('ConversationToolProvider');
  });
});
