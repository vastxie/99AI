import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryByAppIdDto {
  @ApiProperty({ example: 1, description: '应用Id', required: true })
  @IsOptional()
  appId: number;

  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;
}
