import {
  sanitizeChatLogItemForFrontend,
  sanitizeChatLogMessageForFrontend,
} from './chat-log-frontend';
import {
  createChatLog,
  createUnsafeFrontendMessage,
  createUnsafeFrontendMessageString,
} from '../../test/factories/chat-log.factory';
import { createMockQueryBuilder, createMockRepository } from '../../test/mocks/repository.mock';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogService } from './chatLog.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const legacyRawMessage = createUnsafeFrontendMessageString();
const gid = 'g_0123456789abcdefghijklmn';

function expectNoRawToolSecrets(value: any) {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain('SECRET_TOKEN');
  expect(serialized).not.toContain('SECRET_API_KEY');
  expect(serialized).not.toContain('SECRET_BEARER');
  expect(serialized).not.toContain('STDOUT_SECRET');
  expect(serialized).not.toContain('RAW_SECRET');
  expect(serialized).not.toContain('PROVIDER_SECRET');
}

describe('chat-log frontend sanitizing', () => {
  it('sanitizes chatList style rows before returning message to frontend', () => {
    const row = sanitizeChatLogItemForFrontend({
      cid: 'c_test00000000000000000001',
      message: legacyRawMessage,
    });

    expectNoRawToolSecrets(row);
  });

  it('sanitizes chatAll style rows before returning message to frontend', () => {
    const row = sanitizeChatLogItemForFrontend({
      id: 1,
      username: 'user',
      message: legacyRawMessage,
    });

    expectNoRawToolSecrets(row);
  });

  it('sanitizes assistant chat log rows before returning message to frontend', () => {
    const row = sanitizeChatLogItemForFrontend({
      id: 1,
      direction: 'out',
      role: 'assistant',
      message: legacyRawMessage,
    });

    expectNoRawToolSecrets(row);
  });

  it('sanitizes object messages before serializing frontend rows', () => {
    const row = sanitizeChatLogItemForFrontend({
      id: 1,
      message: createUnsafeFrontendMessage(),
    });
    const parsed = JSON.parse(row.message);

    expect(parsed.rounds[0].toolCalls[0].arguments).toEqual({});
    expectNoRawToolSecrets(row);
  });

  it('keeps private file preview and download URLs when returning owner chat history', () => {
    const fileId = 'file_ownerpreview123456789012';
    const row = sanitizeChatLogItemForFrontend(
      {
        cid: 'c_owner_preview',
        message: {
          role: 'user',
          content: '图片内容是？',
          rounds: [
            {
              text: '图片内容是？',
              toolCalls: [
                {
                  id: 'user_upload_1',
                  name: 'user_upload',
                  status: 'success',
                  output: {
                    files: [
                      {
                        type: 'image',
                        fileId,
                        name: 'source.png',
                        mime: 'image/png',
                        previewUrl: `/api/files/${fileId}/preview`,
                        downloadUrl: `/api/files/${fileId}/download`,
                      },
                    ],
                  },
                  internal: {
                    fileRefs: {
                      entries: [{ fileRef: 'attachment_1', fileId }],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      { exposePrivateFileDownloads: true },
    );
    const serialized = JSON.stringify(row);

    expect(serialized).toContain(`/api/files/${fileId}/preview`);
    expect(serialized).toContain(`/api/files/${fileId}/download`);
    expect(serialized).toContain(fileId);
    expect(serialized).not.toContain('"internal"');
  });

  it('keeps invalid JSON and empty messages stable', () => {
    expect(() => sanitizeChatLogMessageForFrontend('{"role":"assistant",')).not.toThrow();
    expect(sanitizeChatLogMessageForFrontend(null)).toBe('');
    expect(sanitizeChatLogMessageForFrontend('')).toBe('');
    expect(sanitizeChatLogMessageForFrontend(undefined)).toBe('');
    expect(sanitizeChatLogMessageForFrontend('{"role":"assistant",')).toBe(
      '"{\\"role\\":\\"assistant\\","',
    );
  });

  describe('service exits', () => {
    let chatLogRepository: any;
    let chatLogService: ChatLogService;

    beforeEach(() => {
      chatLogRepository = createMockRepository(jest.fn);
      const groupRepository = {
        findOne: jest.fn().mockResolvedValue({
          id: 77,
          ownerType: 'user',
          ownerKey: '7',
          channel: 'web',
          isDelete: false,
        }),
      };
      chatLogRepository.manager = {
        transaction: jest.fn(async (callback: (entityManager: unknown) => unknown) =>
          callback({
            getRepository: jest.fn((entity: unknown) =>
              entity === ChatGroupEntity ? groupRepository : chatLogRepository,
            ),
          }),
        ),
      };
      chatLogService = new ChatLogService(
        chatLogRepository,
        {} as any,
        {
          resolveConversationIdByGidForUser: jest.fn().mockResolvedValue(77),
        } as any,
      );
    });

    it('sanitizes chatList rows and keeps the query scoped to the current conversation', async () => {
      chatLogRepository.find.mockResolvedValue([
        createChatLog({
          id: 10,
          userId: 7,
          groupId: 77,
          ttsUrl: '/file/audio/openai/demo.mp3',
          message: legacyRawMessage,
        }),
      ]);

      const rows = await chatLogService.chatList(
        { user: { id: 7, role: 'user' } } as any,
        { gid } as any,
      );

      expect(chatLogRepository.find.mock.calls[0][0].where).toMatchObject({
        userId: 7,
        groupId: 77,
        isDelete: false,
      });
      expect(rows.rows[0].cid).toBe('c_test00000000000000000010');
      expect((rows.rows[0] as any).chatId).toBeUndefined();
      expect(rows.rows[0].ttsUrl).toBe('/file/audio/openai/demo.mp3');
      expectNoRawToolSecrets(rows.rows);
    });

    it('sanitizes chatAll rows returned by the admin listing outlet', async () => {
      const queryBuilder = createMockQueryBuilder({
        manyAndCount: [
          [
            createChatLog({
              id: 20,
              userId: 8,
              user: { username: 'user8', email: 'user8@example.com', nickname: 'User 8' },
              message: legacyRawMessage,
            }),
          ],
          1,
        ],
      });
      chatLogRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await chatLogService.queryAllChatLog(
        { page: 1, size: 20, userId: 8 } as any,
        {} as any,
      );

      expect(queryBuilder.getConditions()).toContainEqual([
        'chatlog.userId = :userId',
        { userId: 8 },
      ]);
      expect(result.count).toBe(1);
      expectNoRawToolSecrets(result.rows);
    });

    it('keeps saveChatLog as an internal raw storage path', async () => {
      const rawLog = createChatLog({
        id: 30,
        userId: 7,
        groupId: 77,
        message: legacyRawMessage,
      });
      chatLogRepository.save.mockImplementation(async (value: any) => value);

      const saved = await chatLogService.saveChatLog(rawLog);

      expect(chatLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ...rawLog,
          channel: 'web',
        }),
      );
      expect(saved.message).toBe(legacyRawMessage);
      expect(JSON.stringify(saved)).toContain('SECRET_TOKEN');
    });
  });
});
