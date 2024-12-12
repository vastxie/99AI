import { ApiProperty } from '@nestjs/swagger';

export class AddAutoReplyDto {
  @ApiProperty({ example: '你是谁', description: '提问的问题', required: true })
  prompt: string;

  @ApiProperty({
    example: '我是AIWeb提供的Ai服务机器人',
    description: '回答的答案',
    required: true,
  })
  answer: string;
}
