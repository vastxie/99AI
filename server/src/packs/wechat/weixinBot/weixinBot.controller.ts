import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { requireRegisteredUser } from '@/common/auth/request-user';
import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { WeixinBotService } from './weixinBot.service';
import { ConfirmBindDto } from './dto/bind.dto';

/** 绑定关系记在 user_bot_channels.userId（数字列）上，只对注册用户开放；访客由守卫以 403 拦下 */
@ApiTags('weixinBot')
@Controller('weixinBot')
@UseGuards(RegisteredUserAuthGuard)
@ApiBearerAuth()
export class WeixinBotController {
  constructor(private readonly weixinBotService: WeixinBotService) {}

  @Get('bind/qrcode')
  @ApiOperation({ summary: '获取微信Bot绑定二维码' })
  async getBindQrCode(@Req() req: Request) {
    return this.weixinBotService.getBindQrCode(requireRegisteredUser(req).id);
  }

  @Get('bind/status')
  @ApiOperation({ summary: '轮询微信Bot绑定二维码状态' })
  async pollBindStatus(@Req() req: Request, @Query('sessionId') sessionId: string) {
    return this.weixinBotService.pollBindStatus(requireRegisteredUser(req).id, sessionId);
  }

  @Post('bind/confirm')
  @ApiOperation({ summary: '确认绑定微信Bot' })
  async confirmBind(@Req() req: Request, @Body() dto: ConfirmBindDto) {
    return this.weixinBotService.confirmBind(requireRegisteredUser(req).id, dto.sessionId);
  }

  @Post('unbind')
  @ApiOperation({ summary: '解绑微信Bot' })
  async unbind(@Req() req: Request) {
    return this.weixinBotService.unbindBot(requireRegisteredUser(req).id);
  }

  @Get('status')
  @ApiOperation({ summary: '查询微信Bot绑定状态' })
  async getStatus(@Req() req: Request) {
    return this.weixinBotService.getBindStatus(requireRegisteredUser(req).id);
  }
}
