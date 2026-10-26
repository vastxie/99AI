import { definePack } from '@/modules/packs/pack.types';
import { ModelOpenAIResponsesPackModule } from './model-openai-responses-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, ModelOpenAIResponsesPackModule);
