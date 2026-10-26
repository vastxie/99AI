import type { AgentEvent } from "../src/index";

export interface AgentEventFixtureEntry {
  declaredOnly?: boolean;
  event: AgentEvent;
}

export interface AgentEventFixtureDocument {
  contractVersion: 1;
  events: AgentEventFixtureEntry[];
}

/**
 * 这份 TypeScript fixture 是可编译的合同事实；同目录 JSON 只作为跨运行时副本。
 * 故意删掉 required wire 字段或改变字面值时，contracts tsc 必须失败。
 */
export const AGENT_EVENT_FIXTURE = {
  contractVersion: 1,
  events: [
    {
      event: {
        type: "agent.start",
        chatId: "assistant-cid-001",
        messageId: "assistant-cid-001",
        turnId: "turn-001",
        timestamp: 1788051600001,
        data: {
          message: "开始处理",
          initialMessages: {
            user: {
              cid: "user-cid-001",
              content: "请整理这段内容",
              role: "user",
              status: 2,
            },
            assistant: {
              cid: "assistant-cid-001",
              content: "",
              role: "assistant",
              status: 1,
              turnId: "turn-001",
            },
          },
        },
      },
    },
    {
      event: {
        type: "agent.end",
        workflowSeq: 15,
        chatId: "assistant-cid-001",
        timestamp: 1788051600015,
        data: { finishReason: "stop" },
      },
    },
    {
      event: {
        type: "agent.error",
        workflowSeq: 16,
        chatId: "assistant-cid-002",
        timestamp: 1788051600016,
        data: {
          code: "MODEL_UNAVAILABLE",
          message: "模型暂时不可用",
          retryable: true,
        },
      },
    },
    {
      event: {
        type: "turn.start",
        workflowSeq: 1,
        chatId: "assistant-cid-001",
        timestamp: 1788051600002,
        data: {
          turn: {
            id: "turn-001",
            status: "running",
            startedAt: "2026-08-30T01:00:00.000Z",
          },
        },
      },
    },
    {
      event: {
        type: "turn.end",
        workflowSeq: 14,
        chatId: "assistant-cid-001",
        timestamp: 1788051600014,
        data: { finishReason: "stop", nextAction: "none" },
      },
    },
    {
      declaredOnly: true,
      event: {
        type: "message.start",
        workflowSeq: 2,
        chatId: "assistant-cid-001",
        timestamp: 1788051600003,
        data: { content: "" },
      },
    },
    {
      event: {
        type: "message.delta",
        workflowSeq: 3,
        chatId: "assistant-cid-001",
        timestamp: 1788051600004,
        data: { delta: "已整理" },
      },
    },
    {
      event: {
        type: "message.end",
        workflowSeq: 12,
        chatId: "assistant-cid-001",
        timestamp: 1788051600012,
        data: { content: "已整理完成" },
      },
    },
    {
      event: {
        type: "message.phase",
        workflowSeq: 8,
        chatId: "assistant-cid-001",
        roundId: "0",
        timestamp: 1788051600009,
        data: { phase: "process" },
      },
    },
    {
      event: {
        type: "reasoning.delta",
        workflowSeq: 4,
        chatId: "assistant-cid-001",
        timestamp: 1788051600005,
        data: { delta: "正在归纳结构" },
      },
    },
    {
      event: {
        type: "tool.start",
        workflowSeq: 5,
        chatId: "assistant-cid-001",
        toolCallId: "tool-call-001",
        timestamp: 1788051600006,
        data: { name: "document_reader", status: "running" },
      },
    },
    {
      event: {
        type: "tool.update",
        workflowSeq: 6,
        chatId: "assistant-cid-001",
        toolCallId: "tool-call-001",
        timestamp: 1788051600007,
        data: { name: "document_reader", status: "running", outputHint: null as unknown },
      },
    },
    {
      event: {
        type: "tool.end",
        workflowSeq: 7,
        chatId: "assistant-cid-001",
        toolCallId: "tool-call-001",
        timestamp: 1788051600008,
        data: {
          name: "document_reader",
          status: "success",
          assets: [
            {
              fileId: "file-public-001",
              role: "final",
              displayName: "整理结果.md",
              mimeType: "text/markdown",
              size: 128,
            },
          ],
        },
      },
    },
    {
      declaredOnly: true,
      event: {
        type: "usage.update",
        workflowSeq: 9,
        chatId: "assistant-cid-001",
        timestamp: 1788051600010,
        data: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      },
    },
    {
      event: {
        type: "billing.update",
        workflowSeq: 10,
        chatId: "assistant-cid-001",
        timestamp: 1788051600011,
        data: { charged: 0.25, summary: { credits: 19.75 } },
      },
    },
    {
      event: {
        type: "snapshot.sync",
        workflowSeq: 17,
        taskEventSeq: 5,
        chatId: "assistant-cid-001",
        taskId: "task-public-001",
        timestamp: 1788051600017,
        data: {
          content: "已整理完成",
          reason: "resync",
          status: null as string | number | null,
          turnStatus: "completed",
          finishReason: "stop",
          usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
        },
      },
    },
  ],
} satisfies AgentEventFixtureDocument;
