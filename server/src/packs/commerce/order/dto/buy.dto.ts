import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BuyDto {
  @ApiProperty({ example: 1, description: '要购买的套餐Id', required: true })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  goodsId: number;

  @ApiProperty({
    example: 'wechat',
    description: '支付方式 (wechat/alipay/paypal/stripe)',
    required: true,
  })
  @IsString()
  @IsIn(['wechat', 'alipay', 'paypal', 'stripe'])
  method: string;

  @ApiProperty({ example: 1, description: '购买数量', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  count: number;

  @ApiProperty({
    example: 'pc',
    description: '设备类型 (pc/mobile/wechat/alipay/qq)',
    required: false,
    default: 'pc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['pc', 'mobile', 'wechat', 'alipay', 'qq'])
  device?: string;
}
