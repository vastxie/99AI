import { definePack } from '@/modules/packs/pack.types';
import { StorageCosPackModule } from './storage-cos-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, StorageCosPackModule);
