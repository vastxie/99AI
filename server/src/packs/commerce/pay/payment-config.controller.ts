import { Public } from '@/common/auth/public.decorator';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentConfigService } from './payment-config.service';

/** 支付配置查询：路径沿用 /config/payment/*，管理端与用户端调用面不变 */
@ApiTags('config')
@Controller('config/payment')
export class PaymentConfigController {
  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  @ApiOperation({ summary: '获取支付渠道状态' })
  @Get('channel-status')
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  getPaymentChannelStatus() {
    return this.paymentConfigService.getPaymentChannelStatus();
  }

  @ApiOperation({ summary: '获取可用支付方式' })
  @Get('methods')
  @Public()
  getAvailablePaymentMethods() {
    return this.paymentConfigService.getAvailablePaymentMethods();
  }
}
