import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryViolationDto extends PaginationQueryDto {
  @ApiProperty({ example: 1, description: '用户ID', required: false })
  @IsOptional()
  userId: number;

  @ApiProperty({
    example: '腾讯云检测',
    description: '检测平台来源',
    required: false,
  })
  @IsOptional()
  typeOriginCn: string;
}
