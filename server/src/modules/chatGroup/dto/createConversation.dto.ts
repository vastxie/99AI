import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @ApiPropertyOptional({ description: '对话标题', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ description: '对话配置' })
  @IsOptional()
  @IsString()
  config?: string;

  @ApiPropertyOptional({ description: '附加参数' })
  @IsOptional()
  @IsString()
  params?: string;
}
