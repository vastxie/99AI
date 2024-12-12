import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoreplyController } from './autoreply.controller';
import { AutoReplyEntity } from './autoreply.entity';
import { AutoreplyService } from './autoreply.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AutoReplyEntity])],
  controllers: [AutoreplyController],
  providers: [AutoreplyService],
  exports: [AutoreplyService],
})
export class AutoreplyModule {}
