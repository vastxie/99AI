import { CHAT_GROUP_GID_PATTERN } from '@/common/utils/createChatGroupGid';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class DeleteConversationDto {
  @ApiProperty({
    example: 'g_0123456789abcdefghijklmn',
    description: '对话组 gid',
    required: true,
  })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @Matches(CHAT_GROUP_GID_PATTERN, { message: 'gid格式无效' })
  gid: string;
}
