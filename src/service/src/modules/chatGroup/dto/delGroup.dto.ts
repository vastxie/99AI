import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from 'typeorm';

export class DelGroupDto {
  @ApiProperty({ example: 1, description: '对话分组ID', required: true })
  groupId: number;
}
