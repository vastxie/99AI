import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QuerAllCramiDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;

  @ApiProperty({ example: 1, description: '使用人Id', required: false })
  @IsOptional()
  useId: number;

  @ApiProperty({
    example: 1,
    description: '卡密状态 0：未使用 1：已消费',
    required: false,
  })
  @IsOptional()
  status: number;
}
