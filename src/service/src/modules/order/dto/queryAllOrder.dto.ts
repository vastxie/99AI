import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, Max, Min, ValidateNested, IsNumber, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseEntity } from 'typeorm';

export class QuerAllOrderDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;

  @ApiProperty({ example: 99, description: '支付的用户id', required: false })
  @IsOptional()
  userId: number;

  @ApiProperty({ example: 'epay', description: '支付的平台', required: false })
  @IsOptional()
  platform: string;

  @ApiProperty({ example: 1, description: '订单状态', required: false })
  @IsOptional()
  status: number;
}
