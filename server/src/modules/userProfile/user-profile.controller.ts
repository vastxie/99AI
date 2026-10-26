import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfileQueryDto } from './dto/userProfileQuery.dto';
import { UserProfileService } from './user-profile.service';

/** 后台用户详情画像：路径仍在 /user 下，聚合逻辑独立成模块，user 模块不再依赖认证、对话与文件模块 */
@Controller('user')
@ApiTags('user')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get(':id/profile')
  @ApiOperation({ summary: '查询用户详情画像' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async getUserProfile(
    @Param('id', ParseIntPipe) id: number,
    @Query(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    query: UserProfileQueryDto,
  ) {
    return await this.userProfileService.getProfile(id, query);
  }
}
