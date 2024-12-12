import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { ScheduleModule } from '@nestjs/schedule';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([UserBalanceEntity])],
  providers: [TaskService],
})
export class TaskModule {}
