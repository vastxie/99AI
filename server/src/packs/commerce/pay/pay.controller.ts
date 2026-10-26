import { RawResponse } from '@/common/interceptors/raw-response.decorator';
import { requireRegisteredUser } from '@/common/auth/request-user';
import {
  All,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Param,
  Headers,
  Res,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayService } from './pay.service';
import { PaymentCallbackService } from './payment-callback.service';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { Request, Response } from 'express';
import type { IncomingHttpHeaders } from 'http';
import {
  buildPaymentCallbackUrls,
  validateSiteUrl,
  escapeHtmlRedirectUrl,
  PaymentCallbackUrls,
} from './payment-callback-url.helper';
import { TestPaymentDto } from './dto/testPayment.dto';
import { FullPaymentTestDto } from './dto/fullPaymentTest.dto';

import { Public } from '@/common/auth/public.decorator';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { getClientIp } from '@/common/utils/getClientIp';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';

// 支付回调页面多语言
const PAYMENT_I18N: Record<string, Record<string, string>> = {
  'zh-CN': {
    titleSuccess: '支付成功',
    msgSuccess: '支付成功！',
    titleFailed: '支付失败',
    msgFailed: '支付处理失败，请联系客服',
    msgVerifyFailed: '支付验证失败，请联系客服',
    redirecting: '正在跳转到主页...',
    titleCancelled: '支付取消',
    msgCancelled: '支付已取消，正在返回...',
    titleReturned: '正在确认支付',
    msgReturned: '已从支付页返回，正在确认支付结果：已付款的到账后会自动更新',
  },
  'en-US': {
    titleSuccess: 'Payment Successful',
    msgSuccess: 'Payment successful!',
    titleFailed: 'Payment Failed',
    msgFailed: 'Payment processing failed, please contact support',
    msgVerifyFailed: 'Payment verification failed, please contact support',
    redirecting: 'Redirecting...',
    titleCancelled: 'Payment Cancelled',
    msgCancelled: 'Payment cancelled, returning...',
    titleReturned: 'Checking payment',
    msgReturned: 'Back from the payment page. If you paid, it will be credited automatically.',
  },
};

function getPaymentLang(acceptLanguage?: string): string {
  if (!acceptLanguage) return 'en-US';
  if (acceptLanguage.includes('zh')) return 'zh-CN';
  return 'en-US';
}

function pt(lang: string, key: string): string {
  return PAYMENT_I18N[lang]?.[key] || PAYMENT_I18N['en-US'][key];
}

@Controller('pay')
@ApiTags('pay')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PayController {
  constructor(
    private readonly payService: PayService,
    private readonly callbackService: PaymentCallbackService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  private async getPaymentUrls(): Promise<PaymentCallbackUrls> {
    const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
    const url = siteUrl as string;
    const error = validateSiteUrl(url);
    if (error) {
      throw new HttpException(error, HttpStatus.BAD_REQUEST);
    }
    return buildPaymentCallbackUrls(url);
  }

  @Post('test')
  @ApiOperation({ summary: '测试支付渠道配置' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async testPayment(@Req() req: Request, @Body() body: TestPaymentDto) {
    const { id: userId } = requireRegisteredUser(req);
    return this.payService.testPayment(userId, body.method, getClientIp(req));
  }

  @Post('test/full-flow')
  @ApiOperation({ summary: '完整支付测试 - 创建真实订单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async createFullPaymentTest(@Req() req: Request, @Body() body: FullPaymentTestDto) {
    const { id: userId } = requireRegisteredUser(req);
    return this.payService.createFullPaymentTest(
      userId,
      body.method,
      body.packageId,
      getClientIp(req),
    );
  }

  @Get('test/full-flow/:orderId')
  @ApiOperation({ summary: '完整支付测试 - 查询测试状态' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async queryFullPaymentTest(@Req() req: Request, @Param('orderId') orderId: string) {
    const { id: userId } = requireRegisteredUser(req);
    return this.payService.queryFullPaymentTest(userId, orderId);
  }

  @RawResponse()
  @All('notify')
  @Public()
  @ApiOperation({ summary: '统一支付结果通知' })
  paymentNotify(
    @Req() req: Request,
    @Query() query: any,
    @Body() body: any,
    @Headers() headers: IncomingHttpHeaders,
  ) {
    const rawParams = req.method === 'GET' ? query || {} : body || {};
    return this.callbackService.handleNotify({
      providerHint: query?.provider || body?.provider || query?.param || body?.param,
      method: req.method,
      query,
      body,
      rawParams,
      headers,
      rawBody: (req as any).rawBody,
    });
  }

  @Get('return')
  @Public()
  @ApiOperation({ summary: '统一支付返回页' })
  async paymentReturn(
    @Query() query: any,
    @Res() res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = getPaymentLang(acceptLanguage);
    const urls = await this.getPaymentUrls();
    const status = String(query?.status || '');

    if (status === 'cancel') {
      res.header('Content-Type', 'text/html');
      return res.send(
        this.renderPaymentResultHtml({
          lang,
          titleKey: 'titleCancelled',
          messageKey: 'msgCancelled',
          icon: '',
          iconClass: 'cancel',
          redirectUrl: urls.frontendCancelUrl,
          delayMs: 1500,
          closeIfOpener: true,
        }),
      );
    }

    try {
      const result = await this.callbackService.handleReturn(query?.provider, status, query || {});
      // 易支付、支付宝的同步回跳不带可验证的结果（到账以异步通知为准）：不说「支付成功」
      const unverified = (result as { status?: string } | undefined)?.status === 'returned';
      res.header('Content-Type', 'text/html');
      return res.send(
        this.renderPaymentResultHtml({
          lang,
          titleKey: unverified ? 'titleReturned' : 'titleSuccess',
          messageKey: unverified ? 'msgReturned' : 'msgSuccess',
          icon: unverified ? '' : '✓',
          iconClass: unverified ? 'cancel' : 'success',
          redirectUrl: unverified ? urls.frontendReturnedUrl : urls.frontendSuccessUrl,
          delayMs: 2000,
          // 在新窗口里付的：关掉结果页，原页面的支付弹窗自己确认到账，不在弹窗里再开一个完整应用
          closeIfOpener: true,
        }),
      );
    } catch (error) {
      Logger.error(`[支付返回] 支付验证失败`, getErrorStack(error), 'PayController');
      res.header('Content-Type', 'text/html');
      return res.send(
        this.renderPaymentResultHtml({
          lang,
          titleKey: 'titleFailed',
          messageKey: 'msgVerifyFailed',
          icon: '✗',
          iconClass: 'error',
          redirectUrl: urls.frontendFailedUrl,
          delayMs: 3000,
          closeIfOpener: true,
        }),
      );
    }
  }

  private renderPaymentResultHtml(options: {
    lang: string;
    titleKey: string;
    messageKey: string;
    icon: string;
    iconClass: string;
    redirectUrl: string;
    delayMs: number;
    closeIfOpener?: boolean;
  }) {
    const redirectUrl = escapeHtmlRedirectUrl(options.redirectUrl);
    // 用 replace 回到站点：结果页不留在历史里，返回键不会再请求一次结果页（再验一次、再跳回来）
    const goBackToSite = `window.location.replace('${redirectUrl}');`;
    // 由站点的支付弹窗打开的新窗口：关掉自己；浏览器不让关（不是脚本打开的窗口）时照常回到站点。
    // 在原窗口里付的，站点跳转前已经断开了 opener，这里不会误关整个站点标签
    const redirectScript = options.closeIfOpener
      ? `if (window.opener && !window.opener.closed) { window.close(); setTimeout(() => { ${goBackToSite} }, 500); } else { ${goBackToSite} }`
      : goBackToSite;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${pt(options.lang, options.titleKey)}</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: #52c41a; font-size: 48px; margin-bottom: 20px; }
          .error { color: #ff4d4f; font-size: 48px; margin-bottom: 20px; }
          .cancel { color: #666; font-size: 18px; margin-bottom: 20px; }
          .message { font-size: 18px; color: #333; margin-bottom: 30px; }
          .redirect { color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        ${options.icon ? `<div class="${options.iconClass}">${options.icon}</div>` : ''}
        <div class="message">${pt(options.lang, options.messageKey)}</div>
        <div class="redirect">${pt(options.lang, 'redirecting')}</div>
        <script>
          setTimeout(() => {
            ${redirectScript}
          }, ${options.delayMs});
        </script>
      </body>
      </html>
    `;
  }
}
