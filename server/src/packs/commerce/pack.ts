import { definePack } from '@/modules/packs/pack.types';
import { CommercePackModule } from './commerce-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, CommercePackModule);
