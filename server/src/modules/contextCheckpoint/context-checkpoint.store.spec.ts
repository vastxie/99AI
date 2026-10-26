import { createHash } from 'node:crypto';
import { AgentContextCheckpointStore } from './context-checkpoint.store';
import type { ContextCheckpointV1 } from './context-checkpoint.types';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const SUMMARY: ContextCheckpointV1 = {
  version: 1 as const,
  goals: ['goal'],
  constraints: [],
  done: [],
  inProgress: [],
  blocked: [],
  decisions: [],
  nextSteps: ['next'],
  criticalContext: [],
  fileRefs: [],
  artifactRefs: [],
};

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('AgentContextCheckpointStore', () => {
  it('loads only an owner-bound checkpoint with a valid checksum and boundary', async () => {
    const entity = {
      groupId: 7,
      ownerType: 'user',
      ownerKey: '9',
      valid: true,
      policyVersion: 1,
      sourceRevision: 4,
      sourceStartLogId: 1,
      compactedThroughLogId: 4,
      summary: JSON.stringify(SUMMARY),
      summaryChecksum: checksum(SUMMARY),
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(entity),
      update: jest.fn(),
    };
    const store = new AgentContextCheckpointStore(repository as any);

    await expect(store.loadValid(7, { ownerType: 'user', ownerKey: '9' }, 4)).resolves.toBe(entity);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { groupId: 7, ownerType: 'user', ownerKey: '9', valid: true },
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('invalidates a corrupted stored projection instead of returning it', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        groupId: 7,
        ownerType: 'user',
        ownerKey: '9',
        valid: true,
        sourceRevision: 4,
        policyVersion: 1,
        sourceStartLogId: 1,
        compactedThroughLogId: 4,
        summary: JSON.stringify(SUMMARY),
        summaryChecksum: '0'.repeat(64),
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const store = new AgentContextCheckpointStore(repository as any);

    await expect(store.loadValid(7, { ownerType: 'user', ownerKey: '9' }, 4)).resolves.toBeNull();
    expect(repository.update).toHaveBeenCalledWith(
      { groupId: 7, ownerType: 'user', ownerKey: '9', sourceRevision: 4 },
      expect.objectContaining({ valid: false, invalidationReason: 'payload_validation_failed' }),
    );
  });

  it('rejects replacing a group checkpoint owned by another principal', async () => {
    const managedRepository = {
      findOne: jest.fn().mockResolvedValue({
        groupId: 7,
        ownerType: 'visitor',
        ownerKey: 'other',
        sourceRevision: 3,
      }),
    };
    const repository = {
      manager: {
        transaction: jest.fn(async (callback: (entityManager: unknown) => unknown) =>
          callback({ getRepository: () => managedRepository }),
        ),
      },
    };
    const store = new AgentContextCheckpointStore(repository as any);

    await expect(
      store.replace({
        groupId: 7,
        ownerType: 'user',
        ownerKey: '9',
        expectedSourceRevision: 3,
        sourceStartLogId: 1,
        compactedThroughLogId: 4,
        backfillComplete: true,
        summary: SUMMARY,
        modelIdentity: 'test:model',
        estimatedInputTokens: 10,
        compactionInputTokens: 8,
        compactionOutputTokens: 2,
      }),
    ).rejects.toThrow(/owner mismatch/);
  });

  it('creates a durable projection revision before history is read', async () => {
    const managedRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: any) => value),
      save: jest.fn((value: any) => Promise.resolve(value)),
    };
    const repository = {
      manager: {
        transaction: jest.fn(async (callback: (entityManager: unknown) => unknown) =>
          callback({ getRepository: () => managedRepository }),
        ),
      },
    };
    const store = new AgentContextCheckpointStore(repository as any);

    await expect(store.beginProjection(7, { ownerType: 'user', ownerKey: '9' })).resolves.toBe(1);
    expect(managedRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 7,
        sourceRevision: 1,
        valid: false,
        invalidationReason: 'projection_pending',
      }),
    );
  });

  it('rejects a stale replacement after the source revision changed', async () => {
    const managedRepository = {
      findOne: jest.fn().mockResolvedValue({
        groupId: 7,
        ownerType: 'user',
        ownerKey: '9',
        sourceRevision: 4,
      }),
    };
    const repository = {
      manager: {
        transaction: jest.fn(async (callback: (entityManager: unknown) => unknown) =>
          callback({ getRepository: () => managedRepository }),
        ),
      },
    };
    const store = new AgentContextCheckpointStore(repository as any);

    await expect(
      store.replace({
        groupId: 7,
        ownerType: 'user',
        ownerKey: '9',
        expectedSourceRevision: 3,
        sourceStartLogId: 1,
        compactedThroughLogId: 4,
        backfillComplete: true,
        summary: SUMMARY,
        modelIdentity: 'test:model',
        estimatedInputTokens: 10,
        compactionInputTokens: 8,
        compactionOutputTokens: 2,
      }),
    ).resolves.toBeNull();
    expect((managedRepository as any).save).toBeUndefined();
  });

  it.each([
    'JSON {"apiKey":"REDACTED_VALUE"}',
    'JSON {"authorization":"Bearer REDACTED_VALUE"}',
    'JSON {"password":"REDACTED_VALUE"}',
    'password：SYNTHETIC_VALUE_1234567890',
    'apiKey＝SYNTHETIC_VALUE_1234567890',
    'token﹕SYNTHETIC_VALUE_1234567890',
    'Bearer：SYNTHETIC_VALUE_1234567890',
    'password∶SYNTHETIC_VALUE_1234567890',
    'password꞉SYNTHETIC_VALUE_1234567890',
    'passwordːSYNTHETIC_VALUE_1234567890',
    '凭证：password∶SYNTHETIC_VALUE_1234567890',
    '说明（password꞉SYNTHETIC_VALUE_1234567890',
    ';passwordːSYNTHETIC_VALUE_1234567890',
    '说明：“password”∶“SYNTHETIC_VALUE_1234567890”',
    '说明：“ password ”∶“SYNTHETIC_VALUE_1234567890”',
    '说明：「token」ː「SYNTHETIC_VALUE_1234567890」',
    '说明：`clientSecret`：`SYNTHETIC_VALUE_1234567890`',
    '说明：**password**：**SYNTHETIC_VALUE_1234567890**',
    '说明：``clientSecret``：``SYNTHETIC_VALUE_1234567890``',
    '说明：**password**：\n**SYNTHETIC_VALUE_1234567890**',
    '说明：“password”\r\n∶\r\n“SYNTHETIC_VALUE_1234567890”',
    '说明：``clientSecret``：\n``SYNTHETIC_VALUE_1234567890``',
  ])(
    'rejects credential-shaped summary content before opening a write transaction',
    async (value: string) => {
      const repository = {
        manager: { transaction: jest.fn() },
      };
      const store = new AgentContextCheckpointStore(repository as any);

      await expect(
        store.replace({
          groupId: 7,
          ownerType: 'user',
          ownerKey: '9',
          expectedSourceRevision: 3,
          sourceStartLogId: 1,
          compactedThroughLogId: 4,
          backfillComplete: true,
          summary: { ...SUMMARY, criticalContext: [value] },
          modelIdentity: 'test:model',
          estimatedInputTokens: 10,
          compactionInputTokens: 8,
          compactionOutputTokens: 2,
        }),
      ).rejects.toThrow(/credential-like/);
      expect(repository.manager.transaction).not.toHaveBeenCalled();
    },
  );
});
