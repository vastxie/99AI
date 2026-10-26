import { registerLoginMethodUi } from '@/auth/loginMethodUi'
import { definePack } from '@/core/packs/definePack'
import GithubOneIcon from './GithubOneIcon.vue'
import manifest from './pack.json'

/** GitHub 包（前端）：只登记登录按钮 / 账号页行内的品牌图标与显示名，流程走内核通用 OAuth 路由 */
export const GITHUB_PROVIDER = 'github'

const enabled =
  String(import.meta.env.VITE_GITHUB_ENABLED ?? 'true')
    .trim()
    .toLowerCase() !== 'false'

if (enabled) {
  registerLoginMethodUi({ provider: GITHUB_PROVIDER, icon: GithubOneIcon, label: () => 'GitHub' })
}

export default definePack({ id: manifest.id, tier: 'system', enabled })
