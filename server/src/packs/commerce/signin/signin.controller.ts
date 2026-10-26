import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { SigninService } from './signin.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { Request } from 'express';

@ApiTags('signIn')
@Controller('signin')
export class SigninController {
  constructor(private readonly signinService: SigninService) {}

  @Post('sign')
  @ApiOperation({ summary: '用户签到' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async sign(@Req() req: Request) {
    return await this.signinService.sign(req);
  }

  @Get('status')
  @ApiOperation({ summary: '今日是否已签到与连续签到天数' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async getStatus(@Req() req: Request) {
    return await this.signinService.getStatus(req);
  }

  @Get('signinLog')
  @ApiOperation({ summary: '获取用户签到信息' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async getSigninLog(@Req() req: Request) {
    return await this.signinService.getSigninLog(req);
  }
}
