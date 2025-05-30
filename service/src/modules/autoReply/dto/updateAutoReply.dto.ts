import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class UpdateAutoReplyDto {
  @ApiProperty({ example: 1, description: '自动回复id', required: true })
  @IsOptional()
  id: number;

  @ApiProperty({ example: '你可以干嘛', description: '问题', required: false })
  @IsOptional()
  prompt: string;

  @ApiProperty({
    example: '我可以干很多事情.......',
    description: '答案',
    required: false,
  })
  @IsOptional()
  answer: string;

  @ApiProperty({ example: 0, description: '状态', required: false })
  @IsOptional()
  status: number;
}
