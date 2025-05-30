import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QuerMyChatLogDto {
  @ApiProperty({ example: 'mj', description: '使用的模型', required: false })
  @IsOptional()
  model: string;
}
