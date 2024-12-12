import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, Max, Min, ValidateNested, IsNumber, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseEntity } from 'typeorm';

export class QuerAllChatLogDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;

  @ApiProperty({ example: 99, description: '对话的用户id', required: false })
  @IsOptional()
  userId: number;

  @ApiProperty({ example: '您好', description: '用户询问的问题', required: false })
  @IsOptional()
  prompt: string;

  @ApiProperty({ example: 'user', description: '身份', required: false })
  role: string;
}
