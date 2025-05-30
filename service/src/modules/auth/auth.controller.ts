import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { UserLoginDto } from './dto/authLogin.dto';
import { UpdatePassByOtherDto } from './dto/updatePassByOther.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  async login(@Body() body: UserLoginDto, @Req() req: Request) {
    return this.authService.login(body, req);
  }

  @Post('updatePassword')
  @ApiOperation({ summary: '用户更改密码' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updatePassword(@Req() req: Request, @Body() body: UpdatePasswordDto) {
    return this.authService.updatePassword(req, body);
  }

  @Post('updatePassByOther')
  @ApiOperation({ summary: '管理员更改用户密码' })
  @UseGuards(JwtAuthGuard)
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async updatePassByOther(@Req() req: Request, @Body() body: UpdatePassByOtherDto) {
    return this.authService.updatePassByOther(req, body);
  }

  @Get('getInfo')
  @ApiOperation({ summary: '获取用户个人信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getInfo(@Req() req: Request) {
    const { id, role } = req.user || {};
    const fingerprint = req.headers.fingerprint;
    Logger.debug(
      `用户信息请求 | ID: ${id} | 角色: ${role} | 指纹: ${fingerprint}`,
      'AuthController',
    );
    return this.authService.getInfo(req);
  }

  @Post('sendCode')
  @ApiOperation({ summary: '发送验证码' })
  async sendCode(@Body() parmas: any) {
    return this.authService.sendCode(parmas);
  }

  @Post('sendPhoneCode')
  @ApiOperation({ summary: '发送手机验证码' })
  async sendPhoneCode(@Body() parmas: any) {
    return this.authService.sendPhoneCode(parmas);
  }

  @Post('verifyIdentity')
  @ApiOperation({ summary: '验证身份' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verifyIdentity(@Req() req: Request, @Body() body: any) {
    return this.authService.verifyIdentity(req, body);
  }

  @Post('verifyPhoneIdentity')
  @ApiOperation({ summary: '验证手机号' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async verifyPhoneIdentity(@Req() req: Request, @Body() body: any) {
    return this.authService.verifyPhoneIdentity(req, body);
  }
}
