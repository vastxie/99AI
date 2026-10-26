import type { AgentContextBuildResult, AgentContextBlock } from './agent-context.types';
import { buildAgentContextManifest } from './agent-context-manifest';
import {
  CONTEXT_TOKEN_WARNING_RATIO,
  ContextBudgetManager,
  ContextBudgetOptions,
  resolveContextMaxTokens,
} from './context-budget-manager';

export class AgentContextTransformer {
  constructor(private readonly budgetManager = new ContextBudgetManager()) {}

  transform(
    blocks: AgentContextBlock[],
    options: ContextBudgetOptions = {},
  ): AgentContextBuildResult {
    const budgetedBlocks = this.budgetManager.apply(blocks, options);
    const maxTokens = resolveContextMaxTokens(options.maxTokens);
    const includedTokens = budgetedBlocks
      .filter(block => block.included !== false)
      .reduce((sum, block) => sum + (block.estimatedTokens || 0), 0);
    const budgetWarnings: string[] = [];
    if (includedTokens >= maxTokens * CONTEXT_TOKEN_WARNING_RATIO) {
      budgetWarnings.push(
        `context_token_budget_warning: used=${includedTokens} limit=${maxTokens}`,
      );
    }
    if (includedTokens > maxTokens) {
      budgetWarnings.push(
        `context_token_budget_exceeded: used=${includedTokens} limit=${maxTokens}`,
      );
    }
    if (
      budgetedBlocks.some(block =>
        ['dropped_budget_exhausted', 'manifest_only_budget_exhausted'].includes(block.reason || ''),
      )
    ) {
      budgetWarnings.push(
        'context_token_budget_exhausted: one or more context blocks were not injected',
      );
    }

    const manifest = buildAgentContextManifest(budgetedBlocks, budgetWarnings);

    return {
      blocks: budgetedBlocks,
      manifest,
      estimatedTokens: manifest.totalEstimatedTokens,
      warnings: manifest.warnings,
    };
  }
}
