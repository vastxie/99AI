import { definePack } from '@/modules/packs/pack.types';
import { StorageOssPackModule } from './storage-oss-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, StorageOssPackModule);
