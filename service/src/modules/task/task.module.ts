import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { ModelsModule } from '../models/models.module';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { TaskService } from './task.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([UserBalanceEntity]),
    GlobalConfigModule,
    ModelsModule,
  ],
  providers: [TaskService],
})
export class TaskModule {}
