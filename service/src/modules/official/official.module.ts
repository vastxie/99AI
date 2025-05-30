import { Global, Module } from '@nestjs/common';
import { OfficialController } from './official.controller';
import { OfficialService } from './official.service';

@Global()
@Module({
  controllers: [OfficialController],
  providers: [OfficialService],
  exports: [OfficialService],
})
export class OfficialModule {}
