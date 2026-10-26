import { definePack } from '@/modules/packs/pack.types';
import { GithubPackModule } from './github-pack.module';
import * as manifest from './pack.json';

export default definePack(manifest, GithubPackModule);
