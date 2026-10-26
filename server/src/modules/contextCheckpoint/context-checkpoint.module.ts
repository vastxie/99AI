import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentContextCheckpointEntity } from './context-checkpoint.entity';
import { AgentContextCheckpointStore } from './context-checkpoint.store';

@Module({
  imports: [TypeOrmModule.forFeature([AgentContextCheckpointEntity])],
  providers: [AgentContextCheckpointStore],
  exports: [AgentContextCheckpointStore],
})
export class ContextCheckpointModule {}
