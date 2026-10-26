/**
 * ConversationToolProvider — 会话控制工具：由 agent 决定怎么把结果呈现给用户、何时停下来问用户。
 *
 * 只控制呈现与交互，不提供外部能力：外部能力仍只经沙箱原语与 MCP 接入。
 * - present_files：从本对话产出的文件里挑出成果文件（顺序 + 说明），其余留作过程文件。
 * - ask_user：向用户提问（可带选项），本轮随即结束，等用户回答。
 */

import { Injectable } from '@nestjs/common';
import { PRESENTATION_TOOL_RESULT_TYPE, QUESTION_TOOL_RESULT_TYPE } from '@99agent/contracts';
import { createLayeredToolResult } from '../../chatLog/tool-result-payload';
import type { FileRefEntry } from '../../fileAsset/file-refs';
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolProvider,
  ToolResult,
} from '../tools/tool-provider.interface';

export const PRESENT_FILES_TOOL = 'present_files';
export const ASK_USER_TOOL = 'ask_user';
const CONVERSATION_TOOL_NAMES = new Set<string>([PRESENT_FILES_TOOL, ASK_USER_TOOL]);

const MAX_PRESENTED_FILES = 20;
const MAX_CAPTION_LENGTH = 120;
const MAX_QUESTION_LENGTH = 1000;
const MAX_OPTIONS = 6;
const MAX_OPTION_LENGTH = 60;
const OUTPUT_REF_PATTERN = /^output_(?:file|image)_\d+$/;

/** 只调用这些工具的轮次不算过程：模型常在同一轮写完回答并展示文件或提问 */
export function isConversationToolName(name: string): boolean {
  return CONVERSATION_TOOL_NAMES.has(name);
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: PRESENT_FILES_TOOL,
      description:
        'Choose which files the user sees as the deliverables of this reply, in order, each with an optional one-line caption. Call it once when the files are final, without a progress note in the same response, then write your final reply after it returns; call it again if you change the files. Files you do not list stay available to the user as process files; list helper scripts and intermediate data only when the user asked for them. Pass an empty list when none of the files are deliverables. Refer to a file by its name or by the fileRef shown in tool results.',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            maxItems: MAX_PRESENTED_FILES,
            items: {
              type: 'object',
              properties: {
                file: {
                  type: 'string',
                  description: 'File name, or a fileRef such as output_file_3.',
                },
                caption: {
                  type: 'string',
                  description: 'Optional short line shown with the file.',
                },
              },
              required: ['file'],
            },
          },
        },
        required: ['files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: ASK_USER_TOOL,
      description:
        "Ask the user a question and end this turn to wait for the answer. Use it only when you cannot continue without the user's decision or missing information; otherwise make a reasonable assumption, say so, and continue. Keep the question to one or two sentences and do not repeat it in your reply text; put any explanation in the reply text. When the answer is a choice, offer 2-6 short options; the user can still reply in their own words.",
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: "The question, in the user's language." },
          options: {
            type: 'array',
            maxItems: MAX_OPTIONS,
            items: { type: 'string' },
            description: 'Optional short answer choices.',
          },
        },
        required: ['question'],
      },
    },
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimmedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 生成本工具的分层结果：失败时类型固定为普通工具，不带成果清单或提问 */
type ResultFactory = (
  status: 'success' | 'error',
  type: string,
  content: string,
  toolResult?: Parameters<typeof createLayeredToolResult>[0]['toolResult'],
) => ToolResult;

function basename(value: string): string {
  const parts = value.split('/').filter(Boolean);
  return parts[parts.length - 1] || value;
}

@Injectable()
export class ConversationToolProvider implements ToolProvider {
  async getToolDefinitions(): Promise<ToolDefinition[]> {
    return TOOL_DEFINITIONS;
  }

  canHandle(toolName: string): boolean {
    return isConversationToolName(toolName);
  }

  getDisplayName(toolName: string): string | undefined {
    if (toolName === PRESENT_FILES_TOOL) return '展示成果文件';
    if (toolName === ASK_USER_TOOL) return '向用户提问';
    return undefined;
  }

  async execute(
    toolName: string,
    args: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const parsed = isPlainObject(args) ? args : undefined;
    const result: ResultFactory = (status, type, content, toolResult) =>
      createLayeredToolResult({
        id: context.toolCallId || `${toolName}_${startedAt}`,
        type: status === 'error' ? 'tool' : type,
        toolName,
        displayName: this.getDisplayName(toolName),
        name: this.getDisplayName(toolName) || toolName,
        status,
        input: parsed || {},
        rawOutput: status === 'error' ? { error: content } : { content },
        time: startedAt,
        duration: Date.now() - startedAt,
        // 结果文本原样给模型：不带 modelContent 时会被当成文件解析结果套上摘要前缀并截断
        toolResult: { status, ...toolResult, modelContent: content },
      });
    if (!parsed) return result('error', 'tool', '工具参数必须是对象');
    if (toolName === PRESENT_FILES_TOOL) return this.presentFiles(parsed, context, result);
    return this.askUser(parsed, result);
  }

  private presentFiles(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    result: ResultFactory,
  ): ToolResult {
    if (!Array.isArray(args.files)) return result('error', 'tool', 'files 必须是数组');
    const requested = args.files;
    if (requested.length > MAX_PRESENTED_FILES)
      return result('error', 'tool', `files 最多 ${MAX_PRESENTED_FILES} 项`);
    // 只能展示本对话已登记的产出文件（沙箱交付与工具媒体），用户上传的附件不在其中
    const outputs = (context.fileRefMappingStore?.entries || []).filter(entry =>
      OUTPUT_REF_PATTERN.test(entry.fileRef),
    );
    const chosen: Array<{ entry: FileRefEntry; caption?: string }> = [];
    const missing: string[] = [];
    for (const item of requested) {
      const reference = trimmedText(isPlainObject(item) ? item.file : item);
      const caption = trimmedText(isPlainObject(item) ? item.caption : undefined).slice(
        0,
        MAX_CAPTION_LENGTH,
      );
      const entry = OUTPUT_REF_PATTERN.test(reference)
        ? outputs.find(candidate => candidate.fileRef === reference)
        : // 按文件名找（也接受 out/ 或 artifacts/ 路径）；同名多版本取最后登记的一版
          outputs.filter(candidate => candidate.name === basename(reference)).pop();
      if (!entry) {
        missing.push(reference || '（空）');
        continue;
      }
      if (chosen.some(existing => existing.entry.fileId === entry.fileId)) continue;
      chosen.push({ entry, ...(caption ? { caption } : {}) });
    }
    if (missing.length) {
      const available = outputs
        .slice(-MAX_PRESENTED_FILES)
        .map(entry => `- ${entry.fileRef} ${entry.name || ''}`.trimEnd())
        .join('\n');
      return result(
        'error',
        'tool',
        `找不到这些文件：${missing.join('、')}。${available ? `可展示的文件：\n${available}` : '本对话还没有产出文件。'}`,
      );
    }
    const lines = chosen.map(
      ({ entry, caption }, index) =>
        `${index + 1}. ${entry.name || entry.fileRef}${caption ? ` — ${caption}` : ''}`,
    );
    return result(
      'success',
      PRESENTATION_TOOL_RESULT_TYPE,
      chosen.length
        ? `已向用户展示 ${chosen.length} 个成果文件：\n${lines.join('\n')}`
        : '已确认本次没有要展示的成果文件，产出的文件都作为过程文件保留。',
      {
        status: 'success',
        display: {
          title: '展示成果文件',
          summary: chosen.length ? `展示 ${chosen.length} 个文件` : '没有成果文件',
          json: {
            presentation: chosen.map(({ entry, caption }) => ({
              fileId: entry.fileId,
              ...(caption ? { caption } : {}),
            })),
          },
        },
        assets: chosen.map(({ entry }) => ({
          fileId: entry.fileId,
          role: 'final',
          displayName: entry.name || entry.fileRef,
          ...(entry.mime ? { mimeType: entry.mime } : {}),
          ...(Number.isFinite(Number(entry.size)) ? { size: Number(entry.size) } : {}),
        })),
      },
    );
  }

  private askUser(args: Record<string, unknown>, result: ResultFactory): ToolResult {
    const question = trimmedText(args.question);
    if (!question) return result('error', 'tool', 'question 不能为空');
    if (question.length > MAX_QUESTION_LENGTH)
      return result('error', 'tool', `question 不能超过 ${MAX_QUESTION_LENGTH} 字`);
    // 模型常把用不到的可选参数填成空值：空值、空项与重复项都忽略，少于两个选项时按自由回答处理
    const options = [
      ...new Set(
        (Array.isArray(args.options) ? args.options : [])
          .map(option => trimmedText(option).slice(0, MAX_OPTION_LENGTH))
          .filter(Boolean),
      ),
    ].slice(0, MAX_OPTIONS);
    const choices = options.length >= 2 ? options : [];
    const listed = choices.map((option, index) => `${index + 1}. ${option}`).join('\n');
    return result(
      'success',
      QUESTION_TOOL_RESULT_TYPE,
      `已向用户提问，本轮到此结束，等待用户回复。\n问题：${question}${listed ? `\n选项：\n${listed}` : ''}`,
      {
        status: 'success',
        display: {
          title: '向用户提问',
          summary: question,
          json: { question: { text: question, options: choices } },
        },
        control: { terminate: true },
      },
    );
  }
}
