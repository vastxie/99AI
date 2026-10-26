import { CHAT_GROUP_GID_PATTERN } from '@/common/utils/createChatGroupGid';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ChatAroundDto {
  @ApiProperty({
    example: 'g_0123456789abcdefghijklmn',
    description: '会话 gid',
    required: true,
  })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @Matches(CHAT_GROUP_GID_PATTERN, { message: 'gid格式无效' })
  gid: string;

  @ApiProperty({ example: 'c_AbC123xYz7890abcdefghi', description: '需要定位的消息外部ID' })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @MaxLength(80)
  @Matches(/^c_[0-9A-Za-z_-]{16,64}$/)
  targetCid: string;

  @ApiProperty({
    example: 50,
    description: '返回目标消息附近条数，默认50，最大80',
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(80)
  limit: number = 50;
}
