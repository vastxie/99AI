import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNumber } from 'class-validator';

export class BatchDelCramiDto {
  @ApiProperty({ example: 1, description: '要删除的套餐Ids', required: true })
  @IsArray({ message: '参数类型为数组' })
  @ArrayMinSize(1, { message: '最短长度为1' })
  ids: number[];
}
