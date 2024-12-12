import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { UserLoginDto } from './dto/authLogin.dto';
import { UserRegisterDto } from './dto/authRegister.dto';
import { UpdatePassByOtherDto } from './dto/updatePassByOther.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  async register(@Body() body: UserRegisterDto, @Req() req: Request) {
    return await this.authService.register(body, req);
  }

  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  async login(@Body() body: UserLoginDto, @Req() req: Request) {
    return this.authService.login(body, req);
  }

  // Todo 类型待优化
  @Post('loginWithCaptcha')
  @ApiOperation({ summary: '用户使用验证码登录' })
  async loginWithCaptcha(@Body() body: any, @Req() req: Request) {
    return this.authService.loginWithCaptcha(body, req);
  }

  @Post('updatePassword')
  @ApiOperation({ summary: '用户更改密码' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updatePassword(@Req() req: Request, @Body() body: UpdatePasswordDto) {
    return this.authService.updatePassword(req, body);
  }

  @Post('updatePassByOther')
  @ApiOperation({ summary: '用户更改密码' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updatePassByOther(
    @Req() req: Request,
    @Body() body: UpdatePassByOtherDto
  ) {
    return this.authService.updatePassByOther(req, body);
  }

  @Get('getInfo')
  @ApiOperation({ summary: '获取用户个人信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getInfo(@Req() req: Request) {
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
