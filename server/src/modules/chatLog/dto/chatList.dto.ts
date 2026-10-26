import { CHAT_GROUP_GID_PATTERN } from '@/common/utils/createChatGroupGid';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class ChatListDto {
  @ApiProperty({
    example: 'g_0123456789abcdefghijklmn',
    description: '会话 gid',
    required: true,
  })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @Matches(CHAT_GROUP_GID_PATTERN, { message: 'gid格式无效' })
  gid: string;

  @ApiProperty({
    example: 50,
    description: '每页条数，默认50，用于分页加载当前会话',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    example: 'cur_xxx.yyy',
    description: '不透明分页游标，获取此游标之前的消息',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @MaxLength(512)
  beforeCursor?: string;
}
