import api from '../index';

export interface McpToolFilter {
  allow?: string[];
  deny?: string[];
}

export interface McpServer {
  name: string;
  transport: 'http' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled: boolean;
  timeoutMs: number;
  toolsCacheTtlMs: number;
  passIdentity: boolean;
  identitySecret?: string;
  description?: string;
  tools?: McpToolFilter;
  /** env：来自环境变量 MCP_SERVERS_JSON，只读；config：后台保存 */
  source: 'env' | 'config';
  stdioAllowed?: boolean;
  /** 与环境变量同名的后台覆盖：删除后恢复环境变量里的配置 */
  overridesEnv?: boolean;
}

export interface McpServersView {
  servers: McpServer[];
  errors: string[];
  stdio: { enabled: boolean; allowlist: string[] };
  /** 后台配置的修订号：保存时带回，期间被别人改过服务端会拒绝（409） */
  revision: string;
  /** 后台配置里无法解析的条目：保存前要确认丢弃 */
  storedErrors: string[];
}

export interface McpServerTestResult {
  ok: boolean;
  message?: string;
  tools?: Array<{ name: string; description: string; exposedName: string; allowed: boolean }>;
}

export type McpServerInput = Omit<McpServer, 'source' | 'stdioAllowed' | 'overridesEnv'>;

export default {
  listServers: () => api.get('mcp/servers'),
  saveServers: (body: { servers: McpServerInput[]; revision: string; discardInvalid?: boolean }) =>
    api.put('mcp/servers', body),
  testServer: (name: string) =>
    api.post(`mcp/servers/${encodeURIComponent(name)}/test`, undefined, { timeout: 1000 * 90 }),
};
