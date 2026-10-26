import { CHAT_GROUP_GID_PATTERN } from '@/common/utils/createChatGroupGid';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateConversationDto {
  @ApiProperty({
    example: 'g_0123456789abcdefghijklmn',
    description: '对话组 gid',
    required: true,
  })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @Matches(CHAT_GROUP_GID_PATTERN, { message: 'gid格式无效' })
  gid: string;

  @ApiPropertyOptional({ description: '对话标题', maxLength: 160 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value).trim()))
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ description: '是否置顶' })
  @IsOptional()
  @IsBoolean()
  isSticky?: boolean;

  @ApiPropertyOptional({ description: '对话配置' })
  @IsOptional()
  @IsString()
  config?: string;

  @ApiPropertyOptional({ description: '附加参数' })
  @IsOptional()
  @IsString()
  params?: string;
}
