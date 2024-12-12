import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppCatsEntity } from './appCats.entity';
import { AppEntity } from './app.entity';
import { UserAppsEntity } from './userApps.entity';

@Module({
	imports: [TypeOrmModule.forFeature([AppCatsEntity, AppEntity, UserAppsEntity])],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
