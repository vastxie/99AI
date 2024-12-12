import { IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class TestDto {
  @ApiProperty({ example: 1, nullable: true, description: '查询用户的id', required: false })
  @IsDefined({ message: '用户id是必传参数' })
  id: number;
}
