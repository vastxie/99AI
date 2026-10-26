/**
 * 默认任务规则；工具用法由 schema 说明，当前能力由 Provider 补充。
 */

export interface SystemPromptInput {
  /** 各 Provider 贡献的段落 */
  sections?: Array<string | undefined>;
}

export function buildKernelSystemPrompt(input: SystemPromptInput = {}): string {
  const sections = (input.sections || []).filter(
    (section): section is string => typeof section === 'string' && section.trim().length > 0,
  );

  const base = `Complete the user's request, using available tools when action is needed.
Work within the requested scope until complete; ask when essential information or a user decision is missing.
Base claims on actual results and state anything incomplete or unverified.
Reply concisely in the user's language.
Text you write together with tool calls is shown to the user as a progress note: in the user's language, say briefly what you are doing and why, or what you found, usually in a sentence or two. Give the complete answer in your final reply, not in progress notes, and do not repeat raw tool output.`;

  return [base, ...sections].join('\n\n');
}
