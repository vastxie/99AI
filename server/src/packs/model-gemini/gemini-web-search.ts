import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
} from '@/modules/modelGateway/model-gateway.types';
import { isGemini3OrLaterModel } from './gemini-model-capabilities';

export interface GeminiNativeWebSearchConfig {
  includeSources: boolean;
}

const INTERNAL_NON_SEARCH_PURPOSES = new Set([
  'context_compaction',
  'test_connection',
  'chat_title',
  'memory_write_extract',
]);

interface GeminiWebSearchCitation {
  title?: string;
  url?: string;
}

interface GeminiWebSearchSource {
  type?: string;
  title?: string;
  url?: string;
}

interface GeminiWebSearchState {
  id: string;
  terminal?: 'success' | 'error';
  lastPayload?: string;
  providerItemIds: string[];
  queries: string[];
  citations: GeminiWebSearchCitation[];
  sources: GeminiWebSearchSource[];
}

export function getGeminiNativeWebSearchConfig(
  request: ModelGatewayRequest,
  options?: { hasFunctionTools?: boolean },
): GeminiNativeWebSearchConfig | undefined {
  if (
    request.disableThinking ||
    request.toolChoice === 'none' ||
    (request.purpose && INTERNAL_NON_SEARCH_PURPOSES.has(request.purpose))
  ) {
    return undefined;
  }
  const config = request.config.capabilities?.nativeTools?.webSearch;
  if (!config?.enabled || config.mode === 'off') return undefined;
  if (options?.hasFunctionTools && !isGemini3OrLaterModel(request.config.model)) {
    return undefined;
  }
  return {
    includeSources: config.includeSources !== false,
  };
}

export function isGoogleSearchServerToolPart(toolType: unknown): boolean {
  return typeof toolType === 'string' && toolType.toUpperCase().includes('GOOGLE_SEARCH');
}

export class GeminiWebSearchCollector {
  private readonly states = new Map<string, GeminiWebSearchState>();
  private latestKey?: string;

  constructor(private readonly includeSources = true) {}

  onPart(part: any): ModelGatewayEvent[] {
    const events: ModelGatewayEvent[] = [];

    if (part?.toolCall && isGoogleSearchServerToolPart(part.toolCall.toolType)) {
      const state = this.getOrCreateState(part.toolCall.id);
      this.collectQueries(state, part.toolCall.args);
      events.push(...this.emit(state, 'searching'));
    }

    if (
      part?.toolResponse &&
      (isGoogleSearchServerToolPart(part.toolResponse.toolType) ||
        (typeof part.toolResponse.id === 'string' && this.states.has(part.toolResponse.id.trim())))
    ) {
      const state = this.getOrCreateState(part.toolResponse.id);
      events.push(...this.emit(state, 'success'));
    }

    return events;
  }

  onGroundingMetadata(groundingMetadata: any): ModelGatewayEvent[] {
    if (!groundingMetadata || typeof groundingMetadata !== 'object') return [];

    const queries = Array.isArray(groundingMetadata.webSearchQueries)
      ? groundingMetadata.webSearchQueries.filter(
          (item: unknown): item is string => typeof item === 'string' && Boolean(item.trim()),
        )
      : [];
    const chunks = Array.isArray(groundingMetadata.groundingChunks)
      ? groundingMetadata.groundingChunks
      : [];
    const webSources = chunks
      .map((chunk: any) => {
        const uri = sanitizeWebSourceUrl(chunk?.web?.uri);
        const title = typeof chunk?.web?.title === 'string' ? chunk.web.title.trim() : '';
        if (!uri && !title) return null;
        return {
          ...(title ? { title } : {}),
          ...(uri ? { url: uri } : {}),
        };
      })
      .filter((item: GeminiWebSearchCitation | null): item is GeminiWebSearchCitation =>
        Boolean(item),
      );

    if (!queries.length && !webSources.length) return [];

    const state = this.latestKey
      ? this.states.get(this.latestKey)!
      : this.getOrCreateState('grounding_metadata');

    for (const query of queries) {
      addUniqueString(state.queries, query.trim());
    }
    if (this.includeSources) {
      for (const source of webSources) {
        addUniqueCitation(state.citations, source);
        addUniqueSource(state.sources, { type: 'url', ...source });
      }
    }

    return this.emit(state, state.terminal || 'success');
  }

  finish(): ModelGatewayEvent[] {
    const events: ModelGatewayEvent[] = [];
    for (const state of this.states.values()) {
      if (!state.terminal) {
        events.push(...this.emit(state, 'success'));
      }
    }
    return events;
  }

  fail(): ModelGatewayEvent[] {
    const events: ModelGatewayEvent[] = [];
    for (const state of this.states.values()) {
      if (!state.terminal) {
        events.push(...this.emit(state, 'error'));
      }
    }
    return events;
  }

  private getOrCreateState(rawId: unknown): GeminiWebSearchState {
    const key = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : 'unidentified';
    let state = this.states.get(key);
    if (!state) {
      state = {
        id: `hosted_web_search_${Date.now().toString(36)}_${this.states.size}`,
        providerItemIds: [],
        queries: [],
        citations: [],
        sources: [],
      };
      this.states.set(key, state);
    }
    if (typeof rawId === 'string' && rawId.trim() && rawId.trim() !== state.id) {
      addUniqueString(state.providerItemIds, rawId.trim());
    }
    this.latestKey = key;
    return state;
  }

  private collectQueries(state: GeminiWebSearchState, args: unknown): void {
    if (!args || typeof args !== 'object') return;
    const record = args as Record<string, unknown>;
    if (typeof record.query === 'string' && record.query.trim()) {
      addUniqueString(state.queries, record.query.trim());
    }
    if (Array.isArray(record.queries)) {
      for (const item of record.queries) {
        if (typeof item === 'string' && item.trim()) {
          addUniqueString(state.queries, item.trim());
        }
      }
    }
  }

  private emit(
    state: GeminiWebSearchState,
    status: 'running' | 'searching' | 'success' | 'error',
  ): ModelGatewayEvent[] {
    if (state.terminal && status !== state.terminal) return [];
    const event = buildGeminiWebSearchEvent(state, status);
    const payload = JSON.stringify(event);
    if (payload === state.lastPayload) return [];
    state.lastPayload = payload;
    if (state.terminal && event.type === 'hosted_tool_call') {
      event.toolCall.update = true;
    }
    if (status === 'success' || status === 'error') {
      state.terminal = status;
    }
    return [event];
  }
}

function addUniqueString(values: string[], value: string): void {
  if (value && !values.includes(value)) values.push(value);
}

function sanitizeWebSourceUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function addUniqueCitation(
  citations: GeminiWebSearchCitation[],
  value: GeminiWebSearchCitation,
): void {
  if (value.url && citations.some(item => item.url === value.url)) return;
  if (!value.url && value.title && citations.some(item => item.title === value.title)) return;
  citations.push(value);
}

function addUniqueSource(values: GeminiWebSearchSource[], value: GeminiWebSearchSource): void {
  if (value.url && values.some(item => item.url === value.url)) return;
  if (!value.url && value.title && values.some(item => item.title === value.title)) return;
  values.push(value);
}

function buildGeminiWebSearchEvent(
  state: GeminiWebSearchState,
  status: 'running' | 'searching' | 'success' | 'error',
): ModelGatewayEvent {
  const citations = state.citations.slice(0, 10);
  const sources = state.sources
    .filter(source => !source.url || !citations.some(citation => citation.url === source.url))
    .slice(0, 10);
  const queryLines = state.queries
    .slice(0, 3)
    .map((query, index) => `${index + 1}. ${query}`)
    .join('\n');
  const sourceLines = [...citations, ...sources]
    .map(
      (item, index) => `${index + 1}. ${item.title || item.url}${item.url ? `\n${item.url}` : ''}`,
    )
    .join('\n');
  const markdown = [
    queryLines ? `搜索查询：\n${queryLines}` : '',
    sourceLines ? `搜索来源：\n${sourceLines}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const sourceCount = citations.length + sources.length;
  const primaryQuery = state.queries.find(query => query.trim());
  const statusText =
    status === 'running'
      ? '准备调用 Google 原生搜索'
      : status === 'searching'
        ? sourceCount
          ? `已发现 ${sourceCount} 个网页来源`
          : '正在搜索公开网页'
        : status === 'error'
          ? 'Google 原生搜索失败'
          : sourceCount
            ? `搜索完成，找到 ${sourceCount} 个网页来源`
            : 'Google 原生搜索完成';

  return {
    type: 'hosted_tool_call',
    toolCall: {
      id: state.id,
      name: 'gemini_google_search',
      displayName: '联网搜索',
      type: 'search',
      status,
      inputSummary: primaryQuery
        ? `搜索：${primaryQuery}`
        : status === 'success' || status === 'error'
          ? '网页检索'
          : '正在搜索公开网页',
      output: {
        summary: statusText,
        queries: [...state.queries],
        results: citations,
        sources,
        providerItemIds: [...state.providerItemIds],
      },
      display: {
        title: '联网搜索',
        summary: statusText,
        ...(markdown ? { markdown } : {}),
        json: { queries: [...state.queries], results: citations, sources },
      },
    },
  };
}
