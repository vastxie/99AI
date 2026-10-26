import { PaginationQueryDto, toOptionalInteger } from '@/common/dto/pagination-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class QueryAllChatLogDto extends PaginationQueryDto {
  @ApiProperty({ example: 99, description: '对话的用户id', required: false })
  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @Min(1)
  userId?: number;

  @ApiProperty({ example: 'gpt-4o-mini', description: '模型', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiProperty({ example: '你好', description: '用户提问关键词', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  prompt?: string;
}
