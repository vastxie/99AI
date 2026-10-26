import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GrantPackageDto } from './dto/grantPackage.dto';
import { UserRechargeDto } from './dto/userRecharge.dto';
import { UserRechargeService } from './user-recharge.service';

/** 积分 / 套餐调整（商业包）。沿用 user/ 前缀以保持管理端接口不变。 */
@ApiTags('user')
@Controller('user')
export class UserRechargeController {
  constructor(private readonly userRechargeService: UserRechargeService) {}

  @Post('recharge')
  @ApiOperation({ summary: '用户充值' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async userRecharge(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    body: UserRechargeDto,
  ) {
    return await this.userRechargeService.userRecharge(body);
  }

  @Post('grantPackage')
  @ApiOperation({ summary: '赠送套餐' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async grantPackage(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    body: GrantPackageDto,
  ) {
    return await this.userRechargeService.grantPackage(body);
  }
}
