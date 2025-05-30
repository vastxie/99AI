import { Module } from '@nestjs/common';
import { SpaController } from './spa.controller';

@Module({
  controllers: [SpaController],
})
export class SpaModule {}
