import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareController } from './share.controller';
import { Share } from './share.entity';
import { ShareService } from './share.service';

@Module({
  imports: [TypeOrmModule.forFeature([Share])],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
