import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { TaskService } from './task.service';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([UserBalanceEntity])],
  providers: [TaskService],
})
export class TaskModule {}
