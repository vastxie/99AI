import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PACKAGE_BILLING_CYCLES, PACKAGE_PLAN_TYPES } from '../package.entity';

export class QueryAllPackageDto extends PaginationQueryDto {
  @ApiProperty({ example: 'name', description: '套餐名称', required: false })
  @IsOptional()
  name: string;

  @ApiProperty({ example: 'pro', description: '方案标识', required: false })
  @IsOptional()
  @IsString()
  planKey?: string;

  @ApiProperty({
    example: 'membership',
    description: '方案类型 membership：周期会员 credit_pack：积分包',
    required: false,
    enum: PACKAGE_PLAN_TYPES,
  })
  @IsOptional()
  @IsIn(PACKAGE_PLAN_TYPES)
  planType?: 'membership' | 'credit_pack';

  @ApiProperty({
    example: 'month',
    description: '周期类型',
    required: false,
    enum: PACKAGE_BILLING_CYCLES,
  })
  @IsOptional()
  @IsIn(PACKAGE_BILLING_CYCLES)
  billingCycle?: 'day' | 'week' | 'month' | 'year' | 'one_time';

  @ApiProperty({
    example: 1,
    description: '套餐状态 0：禁用 1：启用',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status: number;

  @ApiProperty({
    example: 1,
    description: '套餐类型 -1：永久套餐 1：限时套餐',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([-1, 1])
  type: number;
}
