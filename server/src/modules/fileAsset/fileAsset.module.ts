import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { UserEntity } from '../user/user.entity';
import { FileAccessController } from './file-access.controller';
import { FileAssetCleanupScheduler } from './fileAsset-cleanup.scheduler';
import { FileAssetEntity } from './fileAsset.entity';
import { FileAssetStorageService } from './fileAsset-storage.service';
import { FileAssetService } from './fileAsset.service';
import { FileMaterializerService } from './materializer/file-materializer.service';
import { StorageProviderRegistry } from './storage/storage-provider.registry';

@Module({
  imports: [
    TypeOrmModule.forFeature([FileAssetEntity, UserEntity]),
    forwardRef(() => GlobalConfigModule),
  ],
  controllers: [FileAccessController],
  providers: [
    StorageProviderRegistry,
    FileAssetService,
    FileAssetStorageService,
    FileMaterializerService,
    FileAssetCleanupScheduler,
  ],
  exports: [
    StorageProviderRegistry,
    FileAssetService,
    FileAssetStorageService,
    FileMaterializerService,
    FileAssetCleanupScheduler,
  ],
})
export class FileAssetModule {}
