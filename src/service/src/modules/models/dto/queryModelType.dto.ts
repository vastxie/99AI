import { ApiProperty } from '@nestjs/swagger';

export class QueryModelTypeDto {
  @ApiProperty({ example: 1, description: '页码', required: true })
  page: number;

  @ApiProperty({ example: 10, description: '数量', required: true })
  size: number;

  @ApiProperty({ example: 1, description: '模型类型', required: true })
  keyType: number;

  @ApiProperty({ example: true, description: '是否开启当前key对应的模型', required: true })
  status: boolean;
}
