import { HttpException } from '@nestjs/common';
import { ChatLogStatus } from '@/common/constants/status.constant';
import { ChatControlService } from './chat-control.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const assistant = { id: 11, cid: 'c_assistant', status: ChatLogStatus.GENERATING };
const user = { id: 7, role: 'user' };

function workflow(overrides: Record<string, any> = {}) {
  return {
    userId: 7,
    turnId: 'turn_control_1',
    conversationGid: 'g_0123456789abcdefghijklmn',
    operation: {
      operationId: 'op_turn_control_1',
      generation: 2,
      groupId: 3,
      ownerType: 'user',
      ownerKey: '7',
    },
    ...overrides,
  };
}

describe('ChatControlService durable cancellation', () => {
  let chatLogs: any;
  let workflows: any;
  let queue: any;
  let service: ChatControlService;

  beforeEach(() => {
    chatLogs = {
      resolveChatLogByCidForUser: jest.fn().mockResolvedValue(assistant),
      findOneChatLog: jest.fn().mockResolvedValue(assistant),
    };
    workflows = {
      getWorkflowForUser: jest.fn().mockReturnValue(workflow()),
      stop: jest.fn().mockReturnValue(true),
    };
    queue = {
      requestCancel: jest.fn().mockResolvedValue({
        requested: true,
        alreadyRequested: false,
        continuationDiscarded: true,
      }),
    };
    service = new ChatControlService(chatLogs, workflows, queue, undefined);
  });

  it('commits the durable marker before aborting the local controller', async () => {
    const order: string[] = [];
    queue.requestCancel.mockImplementation(async () => {
      order.push('durable');
      return { requested: true, alreadyRequested: false, continuationDiscarded: true };
    });
    workflows.stop.mockImplementation(() => {
      order.push('abort');
      return true;
    });

    await expect(service.stopChat('c_assistant', user)).resolves.toEqual({
      stopped: true,
      status: 'stopped',
    });
    expect(order).toEqual(['durable', 'abort']);
    expect(queue.requestCancel).toHaveBeenCalledWith({
      parentAssistantLogId: 11,
      ownerType: 'user',
      ownerKey: '7',
      expectedTurnId: 'turn_control_1',
      expectedGeneration: 2,
    });
  });

  it('does not abort locally when the durable cancel transaction fails', async () => {
    queue.requestCancel.mockRejectedValue(new Error('database unavailable'));

    await expect(service.stopChat('c_assistant', user)).rejects.toThrow('database unavailable');
    expect(workflows.stop).not.toHaveBeenCalled();
  });

  it('cancels an owned durable operation even when it is not local', async () => {
    workflows.getWorkflowForUser.mockReturnValue(null);
    jest.spyOn(service, 'verifyChatOwner').mockResolvedValue(true);

    await expect(service.stopChat('c_assistant', user)).resolves.toEqual({
      stopped: true,
      status: 'stopped',
    });
    expect(queue.requestCancel).toHaveBeenCalledWith({
      parentAssistantLogId: 11,
      ownerType: 'user',
      ownerKey: '7',
    });
    expect(workflows.stop).not.toHaveBeenCalled();
  });

  it('reports the stored terminal phase when no running operation remains', async () => {
    workflows.getWorkflowForUser.mockReturnValue(null);
    jest.spyOn(service, 'verifyChatOwner').mockResolvedValue(true);
    queue.requestCancel.mockResolvedValue({
      requested: false,
      alreadyRequested: false,
      continuationDiscarded: false,
      terminalPhase: 'completed',
    });
    chatLogs.resolveChatLogByCidForUser.mockResolvedValue({
      ...assistant,
      status: ChatLogStatus.COMPLETED,
    });

    await expect(service.stopChat('c_assistant', user)).resolves.toEqual({
      stopped: false,
      status: 'completed',
    });
  });

  it('reports the finished reply, not stopped, when only a queued follow-up was discarded', async () => {
    workflows.getWorkflowForUser.mockReturnValue(null);
    jest.spyOn(service, 'verifyChatOwner').mockResolvedValue(true);
    queue.requestCancel.mockResolvedValue({
      requested: false,
      alreadyRequested: false,
      continuationDiscarded: true,
      terminalPhase: 'completed',
    });

    await expect(service.stopChat('c_assistant', user)).resolves.toEqual({
      stopped: true,
      status: 'completed',
    });
  });

  it('maps the terminal operation phase to the reply status', async () => {
    workflows.getWorkflowForUser.mockReturnValue(null);
    jest.spyOn(service, 'verifyChatOwner').mockResolvedValue(true);
    const cases: Array<[string, string]> = [
      ['failed', 'error'],
      ['interrupted', 'stopped'],
      ['unknown_phase', 'not_found'],
    ];
    for (const [terminalPhase, status] of cases) {
      queue.requestCancel.mockResolvedValueOnce({
        requested: false,
        alreadyRequested: false,
        continuationDiscarded: false,
        terminalPhase,
      });
      await expect(service.stopChat('c_assistant', user)).resolves.toEqual({
        stopped: false,
        status,
      });
    }
  });

  it('describes a local workflow whose operation has just finished by its terminal phase', async () => {
    queue.requestCancel.mockResolvedValue({
      requested: false,
      alreadyRequested: false,
      continuationDiscarded: false,
      terminalPhase: 'completed',
    });

    // 内存工作流还在（收尾中）：照旧中止并清掉，但回复的结局按操作终态报
    await expect(service.stopChat('c_assistant', user)).resolves.toEqual({
      stopped: true,
      status: 'completed',
    });
    expect(workflows.stop).toHaveBeenCalledWith(11);
  });

  it('rejects a local workflow without the matching durable owner binding', async () => {
    workflows.getWorkflowForUser.mockReturnValue(
      workflow({ operation: { ...workflow().operation, ownerKey: '8' } }),
    );

    await expect(service.stopChat('c_assistant', user)).rejects.toBeInstanceOf(HttpException);
    expect(queue.requestCancel).not.toHaveBeenCalled();
    expect(workflows.stop).not.toHaveBeenCalled();
  });

  it('uses the durable visitor owner key without serializing a visitor object', async () => {
    const visitor = { id: 'visitor-bound-1', role: 'visitor' };
    workflows.getWorkflowForUser.mockReturnValue(
      workflow({
        userId: 'visitor-bound-1',
        operation: {
          ...workflow().operation,
          ownerType: 'visitor',
          ownerKey: 'visitor-bound-1',
        },
      }),
    );

    await service.stopChat('c_assistant', visitor);

    expect(queue.requestCancel).toHaveBeenCalledWith(
      expect.objectContaining({ ownerType: 'visitor', ownerKey: 'visitor-bound-1' }),
    );
  });
});
