/**
 * 回答与过程话术的划分：服务端落库、参考 reducer、web 与渠道共用这一条规则。
 *
 * 调用了普通工具（会话控制工具除外）的轮次标为 `phase: 'process'`，它的文字是过程话术；
 * 最后一个过程轮之后的轮次是回答。没有任何过程轮（包括没有 phase 的旧消息）时全部轮次都是回答。
 */
export type AgentRoundPhase = 'process';

export interface AgentReplyRoundLike {
  text?: unknown;
  phase?: unknown;
}

/** 回答从第几轮开始：最后一个过程轮的下一轮；没有过程轮时是 0 */
export function answerRoundStart(
  rounds: readonly (AgentReplyRoundLike | null | undefined)[],
): number {
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    if (rounds[index]?.phase === 'process') return index + 1;
  }
  return 0;
}

/** 回答文字：回答轮次里有内容的文字去掉首尾空行（保留首行缩进）后按空行连接 */
export function projectAnswerText(
  rounds: readonly (AgentReplyRoundLike | null | undefined)[],
): string {
  return rounds
    .slice(answerRoundStart(rounds))
    .map((round) =>
      typeof round?.text === 'string' ? round.text.replace(/^(?:[ \t]*\n)+/, '').trimEnd() : '',
    )
    .filter((text) => text.trim())
    .join('\n\n');
}

/** 会话控制工具的结果类型：成果清单与向用户提问（其他工具结果的类型不会是这两个） */
export const PRESENTATION_TOOL_RESULT_TYPE = 'presentation';
export const QUESTION_TOOL_RESULT_TYPE = 'question';

/** 成果清单里的一项：展示顺序即数组顺序 */
export interface AgentPresentedFile {
  fileId: string;
  caption?: string;
}

/** 向用户提出的问题：没有选项时用户自由回答 */
export interface AgentQuestion {
  text: string;
  options: string[];
}

export interface AgentReplyToolCallLike {
  type?: unknown;
  status?: unknown;
  display?: unknown;
}

export interface AgentReplyMessageLike {
  rounds?: readonly (
    | (AgentReplyRoundLike & { toolCalls?: readonly (AgentReplyToolCallLike | null | undefined)[] })
    | null
    | undefined
  )[];
}

function displayJsonOf(
  toolCall: AgentReplyToolCallLike | null | undefined,
): Record<string, unknown> {
  const display = toolCall?.display;
  const json =
    display && typeof display === 'object' ? (display as { json?: unknown }).json : undefined;
  return json && typeof json === 'object' && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
}

function nonEmptyText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 成功的成果清单结果；空数组表示「本次没有成果文件」，载荷无效时返回 undefined */
export function readPresentedFiles(
  toolCall: AgentReplyToolCallLike | null | undefined,
): AgentPresentedFile[] | undefined {
  if (toolCall?.type !== PRESENTATION_TOOL_RESULT_TYPE || toolCall.status !== 'success') {
    return undefined;
  }
  const presentation = displayJsonOf(toolCall).presentation;
  if (!Array.isArray(presentation)) return undefined;
  const files: AgentPresentedFile[] = [];
  for (const item of presentation) {
    const fileId = nonEmptyText((item as { fileId?: unknown } | null)?.fileId);
    if (!fileId) return undefined;
    if (files.some((file) => file.fileId === fileId)) continue;
    const caption = nonEmptyText((item as { caption?: unknown }).caption);
    files.push({ fileId, ...(caption ? { caption } : {}) });
  }
  return files;
}

/** 成功的提问结果；载荷无效时返回 undefined */
export function readQuestion(
  toolCall: AgentReplyToolCallLike | null | undefined,
): AgentQuestion | undefined {
  if (toolCall?.type !== QUESTION_TOOL_RESULT_TYPE || toolCall.status !== 'success') {
    return undefined;
  }
  const question = displayJsonOf(toolCall).question;
  if (!question || typeof question !== 'object') return undefined;
  const text = nonEmptyText((question as { text?: unknown }).text);
  if (!text) return undefined;
  const rawOptions = (question as { options?: unknown }).options;
  const options = Array.isArray(rawOptions)
    ? rawOptions.map((option) => nonEmptyText(option)).filter(Boolean)
    : [];
  return { text, options };
}

/** 生效的成果清单：整条消息里最后一次成功且有效的选择；失败的调用不覆盖之前的选择 */
export function findPresentedFiles(
  message: AgentReplyMessageLike | null | undefined,
): AgentPresentedFile[] | undefined {
  const rounds = message?.rounds || [];
  for (let roundIndex = rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const toolCalls = rounds[roundIndex]?.toolCalls || [];
    for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
      const files = readPresentedFiles(toolCalls[index]);
      if (files) return files;
    }
  }
  return undefined;
}

/** 生效的问题：只看最后一轮（提问会结束本轮），其中最后一个成功且有效的提问 */
export function findQuestion(
  message: AgentReplyMessageLike | null | undefined,
): AgentQuestion | undefined {
  const rounds = message?.rounds || [];
  const toolCalls = rounds[rounds.length - 1]?.toolCalls || [];
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const question = readQuestion(toolCalls[index]);
    if (question) return question;
  }
  return undefined;
}

/** 问题的纯文本：问题后按行列出编号选项 */
export function formatQuestionText(question: AgentQuestion): string {
  return [
    question.text,
    ...question.options.map((option, index) => `${index + 1}. ${option}`),
  ].join('\n');
}

/** 回复的纯文本（落库 content、渠道与复制）：回答文字，以提问收尾时再接上问题与选项 */
export function projectReplyText(message: AgentReplyMessageLike | null | undefined): string {
  const question = findQuestion(message);
  return [projectAnswerText(message?.rounds || []), question ? formatQuestionText(question) : '']
    .filter(Boolean)
    .join('\n\n');
}
