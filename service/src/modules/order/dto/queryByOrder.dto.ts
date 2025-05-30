import { ApiProperty } from '@nestjs/swagger';

export class QueryByOrderIdDto {
  @ApiProperty({
    example: 'qwdadadwe-qeqwfcadqw-gguytewj',
    description: '订单ID',
    required: false,
  })
  orderId: string;
}
