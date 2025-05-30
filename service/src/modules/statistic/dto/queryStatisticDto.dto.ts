import { ApiProperty } from '@nestjs/swagger';

export class QueryStatisticDto {
  @ApiProperty({ example: 7, description: '查询最近N天的数据', required: true })
  days: number;
}
