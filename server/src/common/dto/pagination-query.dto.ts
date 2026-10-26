import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 列表分页每页上限，与各分页 DTO 既有的 @Max(100) 一致 */
export const PAGINATION_MAX_SIZE = 100;

/**
 * 查询串里的可选整数：空串 / null 与未提供同义（表单常把空筛选项序列化成 ''），
 * 其余原样转数字交给 @IsInt / @Min 判定（'abc' → NaN、'1.5' → 1.5 都会被拒绝）。
 */
export function toOptionalInteger({ value }: { value: unknown }): number | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  return typeof value === 'number' ? value : Number(value);
}

/**
 * 分页查询参数基类：page / size 均可选（各 service 自带默认值），
 * 查询串经 toOptionalInteger 转成整数并做下限 / 上限校验；其余过滤字段由子类声明。
 */
export class PaginationQueryDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_SIZE)
  size?: number;
}
