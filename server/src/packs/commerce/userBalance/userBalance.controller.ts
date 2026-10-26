import { requireRegisteredUser, requireRequestUser } from '@/common/auth/request-user';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UserBalanceService } from './userBalance.service';

@ApiTags('balance')
@Controller('balance')
export class UserBalanceController {
  constructor(private readonly userBalanceService: UserBalanceService) {}

  @Get('rechargeLog')
  @ApiOperation({ summary: '获取个人充值记录' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getRechargeLog(@Req() req: Request, @Query() params: any) {
    return this.userBalanceService.getRechargeLog(req, params);
  }

  @Get('accountLog')
  @ApiOperation({ summary: '获取所有人账户记录' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async getAccountLog(@Req() req: Request, @Query() params: any) {
    return this.userBalanceService.getAccountLog(req, params);
  }

  @Get('query')
  @ApiOperation({ summary: '获取个人余额信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getBalance(@Req() req: Request) {
    // 访客没有余额记录：返回默认摘要（与 getInfo 给访客的账户摘要一致），不拿 visitorId 查写数字列
    if (requireRequestUser(req).role === 'visitor') {
      return this.userBalanceService.queryUserBalance(null);
    }
    return this.userBalanceService.queryUserBalance(requireRegisteredUser(req).id);
  }
}
