import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FullPaymentTestDto {
  @ApiProperty({ description: '支付方式', example: 'wechat' })
  @IsString()
  @IsIn(['wechat', 'alipay', 'paypal', 'stripe'])
  method: string;

  @ApiProperty({ description: '套餐ID（可选，不传则使用最低价套餐）', required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  packageId?: number;
}
