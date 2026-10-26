import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseService } from './database.service';
import { databaseOptions, openVerifiedDatabase } from './database-schema';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: async () => ({ ...(await databaseOptions()), retryAttempts: 1 }),
      // @nestjs/typeorm 把 dataSourceFactory 的参数声明为可选，但 forRootAsync 总会传入 useFactory 的结果
      dataSourceFactory: options => openVerifiedDatabase(options!),
    }),
  ],
  providers: [DatabaseService],
})
export class DatabaseModule implements OnModuleInit {
  onModuleInit(): void {
    Logger.log('MySQL 已连接，当前结构基线校验通过，自动改表已禁用。', 'DatabaseModule');
  }
}
