import { definePack } from '@/modules/packs/pack.types';
import { ModelAnthropicPackModule } from './model-anthropic-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, ModelAnthropicPackModule);
