import { Module } from '@nestjs/common';
import { GithubOAuthProvider } from './github-oauth.provider';
import { GithubConfigSection } from './github-config.section';

/**
 * GitHub 包：GitHub OAuth 登录 / 绑定。
 * 适配器在构造时向内核 LoginProviderRegistry 注册；由 GITHUB_PACK_ENABLED 决定是否装载。
 */
@Module({
  providers: [GithubOAuthProvider, GithubConfigSection],
})
export class GithubPackModule {}
