import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackageEntity } from './package.entity';
import { OrderEntity } from '../order/order.entity';
import { PackageController } from './package.controller';
import { PackageService } from './package.service';
import { PackageVerticalImportHandler } from './package-vertical-import.handler';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PackageEntity, OrderEntity])],
  providers: [PackageService, PackageVerticalImportHandler],
  controllers: [PackageController],
  exports: [PackageService],
})
export class PackageModule {}
