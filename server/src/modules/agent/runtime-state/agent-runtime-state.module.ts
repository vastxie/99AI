import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentEffectEntity } from './agent-effect.entity';
import { AgentOperationEntity } from './agent-operation.entity';
import { AgentOperationStore } from './operation-ledger.store';
import { AgentContinuationEntity } from './agent-continuation.entity';
import { AgentContinuationStore } from './continuation-inbox.store';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentOperationEntity, AgentEffectEntity, AgentContinuationEntity]),
  ],
  providers: [AgentOperationStore, AgentContinuationStore],
  exports: [AgentOperationStore, AgentContinuationStore],
})
export class AgentRuntimeStateModule {}
