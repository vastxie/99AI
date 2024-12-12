import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNumber } from 'class-validator';

export class BuyDto {
  @ApiProperty({ example: 1, description: '要购买的套餐Id', required: true })
  goodsId: number;

  @ApiProperty({ example: 'wxpay', description: '付款方式', required: false })
  payType: string;

  @ApiProperty({ example: 1, description: '购买数量', required: false })
  count: number;
}
