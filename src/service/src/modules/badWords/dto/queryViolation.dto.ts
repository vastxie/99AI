import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryViolationDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;

  @ApiProperty({ example: 1, description: '用户ID', required: false })
  @IsOptional()
  userId: number;

  @ApiProperty({ example: '百度云检测', description: '检测平台来源', required: false })
  @IsOptional()
  typeOriginCn: string;
}
