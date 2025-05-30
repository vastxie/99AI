import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class QuerySingleChatDto {
  @ApiProperty({ example: '123', description: '聊天记录ID' })
  @IsNotEmpty({ message: '聊天记录ID不能为空' })
  chatId: number;
}
