import { IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class QueryConfigDto {
  @ApiProperty({ example: ['siteName', 'qqNumber'], description: '想要查询的配置key' })
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => String)
  keys: string[];
}
