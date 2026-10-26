import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toOptionalInteger } from '@/common/dto/pagination-query.dto';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * 管理端下拉框会一次拉取全部模型（size 1000），所以不继承带每页上限的 PaginationQueryDto，
 * 只做整数与下限校验。
 */
export class QueryModelDto {
  @ApiProperty({ example: 1, description: '页码', required: false })
  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @Min(1)
  page: number;

  @ApiProperty({ example: 10, description: '数量', required: false })
  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @Min(1)
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
