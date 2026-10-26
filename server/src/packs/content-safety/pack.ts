import { definePack } from '@/modules/packs/pack.types';
import { ContentSafetyPackModule } from './content-safety-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, ContentSafetyPackModule);
