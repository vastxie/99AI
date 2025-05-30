import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChatListDto {
  @ApiProperty({ example: 1, description: '对话分组ID', required: false })
  @IsOptional()
  groupId: number;
}
