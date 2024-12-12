import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryBadWordsDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;

  @ApiProperty({ example: 'test', description: '敏感词内容', required: false })
  @IsOptional()
  word: string;

  @ApiProperty({ example: 1, description: '关键词状态', required: false })
  @IsOptional()
  status: number;
}
