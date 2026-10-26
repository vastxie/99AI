import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { Public } from '@/common/auth/public.decorator';
import { RegisteredUserAuthGuard } from '@/common/auth/registeredUserAuth.guard';
import { requireRegisteredUser } from '@/common/auth/request-user';
import { getClientIp } from '@/common/utils';
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { CaptchaAuthService } from './captcha/captcha-auth.service';
import { UserLoginDto } from './dto/authLogin.dto';
import { CaptchaSendBindCodeDto, CaptchaSendCodeDto } from './dto/captchaSendCode.dto';
import { CaptchaVerifyDto } from './dto/captchaVerify.dto';
import { QrPollDto, QrSceneDto } from './dto/qrScene.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';
import { VisitorSessionDto } from './dto/visitorSession.dto';
import {
  CreateOAuthUrlBody,
  OAuthAuthService,
  OAuthCallbackBody,
} from './providers/oauth-auth.service';
import { QrAuthService } from './providers/qr-auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly captchaAuth: CaptchaAuthService,
    private readonly oauthAuth: OAuthAuthService,
    private readonly qrAuth: QrAuthService,
  ) {}

  /* ---- 内核：账号密码 / 游客 / 资料 ---- */

  @Post('login')
  @Public()
  @ApiOperation({ summary: '账号密码登录' })
  async login(@Body() body: UserLoginDto, @Req() req: Request) {
    return this.authService.login(body, req);
  }

  @Post('register')
  @Public()
  @ApiOperation({ summary: '账号密码注册' })
  async register(@Body() body: RegisterDto, @Req() req: Request) {
    return this.authService.register(body, req);
  }

  @Get('providers')
  @Public()
  @ApiOperation({ summary: '获取可用登录方式' })
  async listProviders() {
    return this.authService.listProviders();
  }

  @Post('visitor-session')
  @Public()
  @ApiOperation({ summary: '签发游客会话' })
  async createVisitorSession(@Body() body: VisitorSessionDto, @Req() req: Request) {
    return this.authService.createVisitorSession(body, req);
  }

  @Get('getInfo')
  @ApiOperation({ summary: '获取用户个人信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getInfo(@Req() req: Request) {
    return this.authService.getInfo(req);
  }

  @Post('updatePassword')
  @ApiOperation({ summary: '用户更改密码' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async updatePassword(@Req() req: Request, @Body() body: UpdatePasswordDto) {
    return this.authService.updatePassword(req, body);
  }

  @Get('identities')
  @ApiOperation({ summary: '获取当前用户登录身份' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async listIdentities(@Req() req: Request) {
    return this.authService.listIdentities(req);
  }

  @Post('identities/:identityId/unbind')
  @ApiOperation({ summary: '解绑登录身份' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async unbindIdentity(@Req() req: Request, @Param('identityId') identityId: string) {
    return this.authService.unbindIdentity(req, Number(identityId));
  }

  /* ---- 验证码类登录方式（邮箱 / 手机号……，由渠道包提供发送实现） ---- */

  @Post('captcha/send-code')
  @Public()
  @ApiOperation({ summary: '发送登录 / 找回密码验证码' })
  async sendCaptchaCode(@Body() body: CaptchaSendCodeDto, @Req() req: Request) {
    return this.captchaAuth.sendCode(body.contact, body.scene, getClientIp(req));
  }

  @Post('captcha/send-bind-code')
  @ApiOperation({ summary: '发送绑定联系方式验证码' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async sendCaptchaBindCode(@Req() req: Request, @Body() body: CaptchaSendBindCodeDto) {
    return this.captchaAuth.sendBindCode(requireRegisteredUser(req).id, body.contact);
  }

  @Post('captcha/login')
  @Public()
  @ApiOperation({ summary: '验证码登录（首次自动注册）' })
  async captchaLogin(@Body() body: CaptchaVerifyDto, @Req() req: Request) {
    return this.captchaAuth.login(body.contact, body.code, req);
  }

  @Post('captcha/bind')
  @ApiOperation({ summary: '绑定联系方式' })
  @UseGuards(RegisteredUserAuthGuard)
  @ApiBearerAuth()
  async captchaBind(@Req() req: Request, @Body() body: CaptchaVerifyDto) {
    return this.captchaAuth.bind(requireRegisteredUser(req).id, body.contact, body.code);
  }

  @Post('captcha/verify-reset')
  @Public()
  @ApiOperation({ summary: '验证找回密码验证码' })
  async verifyResetCode(@Body() body: CaptchaVerifyDto) {
    return this.captchaAuth.verifyResetCode(body.contact, body.code);
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({ summary: '重置密码' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.captchaAuth.resetPassword(body.contact, body.resetToken, body.password);
  }

  /* ---- OAuth 类登录方式（由各登录渠道包实现） ---- */

  @Post('oauth/:provider/url')
  @Public()
  @ApiOperation({ summary: '获取 OAuth 授权地址' })
  async createOAuthUrl(
    @Param('provider') provider: string,
    @Body() body: CreateOAuthUrlBody,
    @Req() req: Request,
  ) {
    return this.oauthAuth.createOAuthUrl(provider, body, req);
  }

  @Post('oauth/:provider/callback')
  @Public()
  @ApiOperation({ summary: 'OAuth 授权回调登录' })
  async oauthCallback(
    @Param('provider') provider: string,
    @Body() body: OAuthCallbackBody,
    @Req() req: Request,
  ) {
    return this.oauthAuth.oauthCallback(provider, body, req);
  }

  /* ---- 扫码类登录方式（公众号扫码……） ---- */

  @Post('qr/:provider/scene')
  @Public()
  @ApiOperation({ summary: '创建扫码登录 / 绑定场景' })
  async createQrScene(
    @Param('provider') provider: string,
    @Body() body: QrSceneDto,
    @Req() req: Request,
  ) {
    return this.qrAuth.createScene(provider, body.scene, req);
  }

  @Post('qr/:provider/poll')
  @Public()
  @ApiOperation({ summary: '轮询扫码结果' })
  async pollQrScene(
    @Param('provider') provider: string,
    @Body() body: QrPollDto,
    @Req() req: Request,
  ) {
    return this.qrAuth.pollScene(provider, body.sceneId, body.scene, req);
  }
}
