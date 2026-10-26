import { definePack } from '@/modules/packs/pack.types';
import { EmailPackModule } from './email-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, EmailPackModule);
