import { Injectable } from '@nestjs/common';
import type { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import type { UnifiedMessage } from '../chatLog/types/message.types';
import type { ChatPreflightResult } from './chat-preflight.service';
import { ChatTurnPersistenceService, ChatTurnRecords } from './chat-turn-persistence.service';
import type { EntityManager } from 'typeorm';

@Injectable()
export class ChatInteractionRunner {
  constructor(private readonly turns: ChatTurnPersistenceService) {}

  run(input: {
    preflight: ChatPreflightResult;
    userMessage: UnifiedMessage;
    group: ChatGroupEntity;
    manager: EntityManager;
  }): Promise<ChatTurnRecords> {
    return this.turns.writeTurnInTransaction({
      ...input,
    });
  }
}
