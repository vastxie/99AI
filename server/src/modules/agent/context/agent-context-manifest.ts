import { REDACTED_TEXT } from '@/common/constants/redaction.constant';
import type { AgentContextBlock, AgentContextBlockSource } from './agent-context.types';

export interface AgentContextManifestBlock {
  id: string;
  type: string;
  source?: AgentContextBlockSource;
  estimatedTokens: number;
  included: boolean;
  truncated: boolean;
  reason?: string;
  warnings?: string[];
}

export interface AgentContextManifest {
  blocks: AgentContextManifestBlock[];
  totalEstimatedTokens: number;
  truncated: boolean;
  warnings: string[];
}

const SENSITIVE_SOURCE_TEXT_PATTERNS = [
  /(?:https?:\/\/[^/\s)\]'"<>]+)?\/api\/files\/file_[a-zA-Z0-9_-]+\/(?:download|preview)(?:[?#][^\s)\]'"<>]*)?/gi,
  /(?:^|\s)(?:\/Users\/|\/private\/var\/|\/var\/folders\/|[A-Za-z]:\\Users\\)[^\s)\]'"<>，。]*/g,
  /\b(?:api[_\s-]?key|authorization|bearer|token|secret|password)\s*[:=]\s*[^\s,;，。)）]+/gi,
  /\bbase[_\s-]?url\s*[:=]\s*[^\s,;，。)）]+/gi,
  /(?:provider\s+raw\s+payload|provider[_\s-]?payload|provider[_\s-]?response|raw[_\s-]?(?:payload|response|output))\s*[:=][^\n\r]*/gi,
  /\bruntime[_\s-]?log\s*[:=][^\n\r]*/gi,
  /\bstd(?:out|err)\s*[:=][^\n\r]*/gi,
  /\bstack(?:\s+trace)?\s*[:=][\s\S]*/gi,
  /\btrace\s*[:=][^\n\r]*/gi,
  /\n\s*at\s+.+\(.+:\d+:\d+\)/g,
];

function sanitizeManifestText(value: string): string {
  return SENSITIVE_SOURCE_TEXT_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, REDACTED_TEXT),
    value,
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function sanitizeManifestWarnings(warnings?: string[]): string[] {
  const sanitized = (warnings || [])
    .map(warning => sanitizeManifestText(String(warning || '')))
    .filter(Boolean);
  return [...new Set(sanitized)];
}

function sanitizeSource(source?: AgentContextBlockSource): AgentContextBlockSource | undefined {
  if (!source?.module) return undefined;
  return {
    module: sanitizeManifestText(source.module),
    ...(source.id ? { id: sanitizeManifestText(source.id) } : {}),
  };
}

export function buildAgentContextManifest(
  blocks: AgentContextBlock[],
  extraWarnings: string[] = [],
): AgentContextManifest {
  const manifestBlocks = blocks.map(block => {
    const source = sanitizeSource(block.source);
    const warnings = sanitizeManifestWarnings(block.warnings);
    return {
      id: block.id,
      type: block.type,
      ...(source ? { source } : {}),
      estimatedTokens: block.estimatedTokens || 0,
      included: block.included !== false,
      truncated: Boolean(block.truncated || block.reason === 'truncated'),
      ...(block.reason ? { reason: block.reason } : {}),
      ...(warnings.length ? { warnings } : {}),
    };
  });
  const warnings = [
    ...blocks.flatMap(block => sanitizeManifestWarnings(block.warnings)),
    ...sanitizeManifestWarnings(extraWarnings),
  ];

  return {
    blocks: manifestBlocks,
    totalEstimatedTokens: manifestBlocks
      .filter(block => block.included)
      .reduce((sum, block) => sum + block.estimatedTokens, 0),
    truncated: manifestBlocks.some(
      block => !block.included || block.truncated || block.reason === 'truncated',
    ),
    warnings: [...new Set(warnings)],
  };
}
