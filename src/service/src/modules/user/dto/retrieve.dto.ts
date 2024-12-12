import { IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RetrieveUserDto {
  @ApiProperty({ example: 100, nullable: true, description: '查询用户的id', required: false })
  id: number;

  @ApiProperty({ example: 'sfas12', nullable: true, description: 'TODO待完善', required: false })
  secret: string

  @ApiProperty({ example: 100, nullable: true, description: 'TODO待完善', required: false })
  moreId: number
}
