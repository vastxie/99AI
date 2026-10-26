import { definePack } from '@/modules/packs/pack.types';
import { StorageS3PackModule } from './storage-s3-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, StorageS3PackModule);
