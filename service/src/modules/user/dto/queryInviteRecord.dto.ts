import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class queryInviteRecordDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;
}
