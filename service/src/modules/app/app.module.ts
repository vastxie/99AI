import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { AppController } from './app.controller';
import { AppEntity } from './app.entity';
import { AppService } from './app.service';
import { AppCatsEntity } from './appCats.entity';
import { UserAppsEntity } from './userApps.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppCatsEntity, AppEntity, UserAppsEntity])],
  controllers: [AppController],
  providers: [AppService, UserBalanceService],
})
export class AppModule {}
