import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, Max, Min, ValidateNested, IsNumber, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseEntity } from 'typeorm';

export class QuerMyChatLogDto {
  @ApiProperty({ example: 'mj', description: '使用的模型', required: false })
  @IsOptional()
  model: string;
}
