import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class OperateAppDto {
  @ApiProperty({ example: 1, description: '要删除的appId', required: true })
  @IsNumber({}, { message: 'ID必须是Number' })
  id: number;
}
