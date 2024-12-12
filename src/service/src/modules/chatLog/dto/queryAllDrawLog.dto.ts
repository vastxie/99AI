import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, Max, Min, ValidateNested, IsNumber, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseEntity } from 'typeorm';

export class QuerAllDrawLogDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;

  @ApiProperty({ example: 1, description: '是否推荐0: 默认 1: 推荐', required: false })
  @IsOptional()
  rec: number;

  @ApiProperty({ example: 99, description: '生成图片的用户id', required: false })
  @IsOptional()
  userId: number;

  @ApiProperty({ example: 'DALL-E2', description: '生成图片使用的模型', required: false })
  @IsOptional()
  model: string;
}
