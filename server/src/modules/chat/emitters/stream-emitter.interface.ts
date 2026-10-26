import { AgentEvent } from '@99agent/contracts';

/**
 * 流式传输适配器接口
 * 抽象传输层，ChatService 不感知底层是 WebSocket 还是其他协议
 */
export interface StreamEmitter {
  /**
   * 发送一个 Agent 事件
   */
  emit(event: AgentEvent): void;
}
