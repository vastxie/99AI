import { definePack } from '@/modules/packs/pack.types';
import { ModelGeminiPackModule } from './model-gemini-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, ModelGeminiPackModule);
