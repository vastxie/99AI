import type { AgentRuntimeToolCall } from './contracts';

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return `${value}`;
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

type RecordEntry = { toolName: string; argsKey: string; resultKey?: string };

export class LoopDetector {
  private roundCount = 0;
  private readonly history: RecordEntry[] = [];

  constructor(private readonly maxRounds: number) {}

  beginRound(): void {
    this.roundCount += 1;
  }

  getRoundCount(): number {
    return this.roundCount;
  }

  check(toolCalls: AgentRuntimeToolCall[]): {
    shouldBreak: boolean;
    reason?: string;
  } {
    if (this.roundCount > this.maxRounds) return { shouldBreak: true, reason: 'max_rounds' };
    for (const call of toolCalls) {
      this.history.push({
        toolName: call.function.name,
        argsKey: stableStringify(call.function.arguments),
      });
    }
    if (this.history.length > 30) this.history.splice(0, this.history.length - 30);
    if (this.history.length >= 8) {
      const recent = this.history.slice(-8);
      const pairs = [0, 2, 4, 6].map(
        (index) => `${recent[index].toolName}->${recent[index + 1].toolName}`,
      );
      if (new Set(pairs).size === 1) return { shouldBreak: false, reason: 'ping_pong' };
    }
    return { shouldBreak: false };
  }

  recordOutcome(toolName: string, args: string, result: unknown): void {
    const argsKey = stableStringify(args);
    for (let index = this.history.length - 1; index >= 0; index -= 1) {
      const entry = this.history[index];
      if (entry.toolName === toolName && entry.argsKey === argsKey && !entry.resultKey) {
        entry.resultKey = stableStringify(result);
        return;
      }
    }
  }
}
