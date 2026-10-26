import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ChatSearchDto {
  @ApiProperty({ example: '升级方案', description: '搜索关键词，匹配对话标题和消息内容' })
  @Transform(({ value }) => String(value || '').trim())
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  keyword: string;

  @ApiProperty({ example: 30, description: '最多返回条数，默认30，最大50', required: false })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 30;
}
