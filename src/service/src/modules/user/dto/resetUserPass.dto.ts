import { IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ResetUserPassDto {
  @ApiProperty({ example: 1, nullable: true, description: '用户id', required: false })
  @IsDefined({ message: '用户id是必传参数' })
  id: number;
}
