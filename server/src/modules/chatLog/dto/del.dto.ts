import { CHAT_GROUP_GID_PATTERN } from '@/common/utils/createChatGroupGid';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class DelDto {
  @ApiProperty({ example: 'c_AbC123xYz7890abcdefghi', description: '消息外部ID', required: true })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @MaxLength(80)
  @Matches(/^c_[0-9A-Za-z_-]{16,64}$/)
  cid: string;

  @ApiProperty({
    example: 'g_0123456789abcdefghijklmn',
    description: '会话 gid',
    required: true,
  })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @Matches(CHAT_GROUP_GID_PATTERN, { message: 'gid格式无效' })
  gid: string;
}
