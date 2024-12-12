import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNumber } from 'class-validator';

export class QueryByOrderIdDto {
  @ApiProperty({ example: 'qwdadadwe-qeqwfcadqw-gguytewj', description: '订单ID', required: false })
  orderId: string;
}
