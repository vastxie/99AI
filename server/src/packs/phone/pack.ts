import { definePack } from '@/modules/packs/pack.types';
import { PhonePackModule } from './phone-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, PhonePackModule);
