import { createUnsafeToolCall } from './tool-call.factory';

export function createUnsafeFrontendMessage(overrides: Record<string, any> = {}) {
  return {
    role: 'assistant',
    content: 'done',
    rounds: [
      {
        text: 'done',
        toolCalls: [createUnsafeToolCall()],
      },
    ],
    ...overrides,
  };
}

export function createUnsafeFrontendMessageString(overrides: Record<string, any> = {}) {
  return JSON.stringify(createUnsafeFrontendMessage(overrides));
}

export function createChatLog(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    cid: `c_test${String(overrides.id || 1).padStart(20, '0')}`,
    userId: 1,
    visitorId: null as string | null,
    direction: 'out',
    type: 1,
    status: 3,
    content: 'done',
    model: 'model',
    modelName: 'Model',
    message: createUnsafeFrontendMessageString(),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    isDelete: false,
    ...overrides,
  };
}
