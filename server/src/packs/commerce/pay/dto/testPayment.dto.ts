import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class TestPaymentDto {
  @ApiProperty({ description: '支付方式', example: 'wechat' })
  @IsString()
  @IsIn(['wechat', 'alipay', 'paypal', 'stripe'])
  method: string;
}
