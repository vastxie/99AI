import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class QueryByOrderIdDto {
  @ApiProperty({
    example: 'qwdadadwe-qeqwfcadqw-gguytewj',
    description: '订单ID',
    required: false,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  orderId: string;
}
