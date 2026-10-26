import { Server, Socket } from 'socket.io';
import { AgentEvent } from '@99agent/contracts';
import { StreamEmitter } from './stream-emitter.interface';

/**
 * WebSocket 传输适配器
 * chatId 创建前通过 socket 直推，创建后切换为 server.to(room).emit()
 */
export class WSEmitter implements StreamEmitter {
  private server: Server | null = null;
  private room: string | null = null;

  /**
   * @param submissionId 发起这一串回合的提交号：经这个发送器推出的 agent.error 都带上它。
   *   用户的每个页签都可能收到（接续轮的错误走房间广播），正在等自己回执的页签据此只认自己的
   */
  constructor(
    private readonly socket: Socket,
    private readonly submissionId = '',
  ) {}

  emit(input: AgentEvent): void {
    const event =
      input.type === 'agent.error' && this.submissionId && !input.data?.submissionId
        ? ({ ...input, data: { ...input.data, submissionId: this.submissionId } } as AgentEvent)
        : input;
    if (this.server && this.room) {
      void this.server.to(this.room).emit('agent:event', event);
    } else {
      void this.socket.emit('agent:event', event);
    }
  }

  /**
   * chatId 创建后切换为 room emit
   */
  setRoom(server: Server, room: string): void {
    this.server = server;
    this.room = room;
  }
}
