import { ApiProperty } from '@nestjs/swagger';

export class QueryModelDto {
  @ApiProperty({ example: 1, description: '页码', required: true })
  page: number;

  @ApiProperty({ example: 10, description: '数量', required: true })
  size: number;

  @ApiProperty({ example: 1, description: '模型类型', required: true })
  keyType: number;

  @ApiProperty({
    example: 'dsadgadaorjoqm',
    description: '模型key',
    required: true,
  })
  key: string;

  @ApiProperty({
    example: true,
    description: '是否开启当前key对应的模型',
    required: true,
  })
  status: boolean;

  @ApiProperty({
    example: 'gpt-3.5',
    description: '当前key绑定的模型是多少 需要调用的模型',
    required: true,
  })
  model: string;
}
