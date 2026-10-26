import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAuthIdentityEntity } from '../auth/identity/user-auth-identity.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { FileAssetEntity } from '../fileAsset/fileAsset.entity';
import { UserEntity } from '../user/user.entity';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';

/**
 * 后台用户详情画像：汇总账号、登录身份、对话与文件用量，以及扩展包经 UserProfileSectionRegistry
 * 登记的片段。独立于 user 模块，避免 user 反向依赖认证、对话与文件模块形成循环。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, UserAuthIdentityEntity, ChatLogEntity, FileAssetEntity]),
  ],
  controllers: [UserProfileController],
  providers: [UserProfileService],
})
export class UserProfileModule {}
