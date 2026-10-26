import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class StopChatDto {
  @ApiProperty({ description: '助手消息外部ID', example: 'c_AbC123xYz7890abcdefghi' })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @MaxLength(80)
  @Matches(/^c_[0-9A-Za-z_-]{16,64}$/)
  cid: string;
}
