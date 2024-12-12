import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { PayService } from './pay.service';
import { PayDto } from './dto/pay.dto';
import { Request } from 'express';

@Controller('pay')
@ApiTags('pay')
export class PayController {
  constructor(private readonly payService: PayService) { }

  @Post('notify')
  @ApiOperation({ summary: 'hupi支付结果通知' })
  notifyHupi(@Body() body) {
    console.log('hupi ->body: ', body);
    return this.payService.notify(body);
  }

  @Post('notify')
  @ApiOperation({ summary: 'ltzf支付结果通知' })
  notifyLtzf(@Body() body) {
    console.log('ltzf ->body: ', body);
    return this.payService.notify(body);
  }

  @Get('notify')
  @ApiOperation({ summary: 'Epay支付结果通知' })
  notifyEpay(@Query() query) {
    console.log('epay ->query: ', query);
    return this.payService.notify(query);
  }
}
