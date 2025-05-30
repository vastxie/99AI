import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayDto {
  @ApiProperty({ example: 1, description: '订单号', required: true })
  @IsOptional()
  orderId: string;
}
