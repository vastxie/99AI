import { definePack } from '@/modules/packs/pack.types';
import { ModelOpenCodeGoPackModule } from './model-opencode-go-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, ModelOpenCodeGoPackModule);
