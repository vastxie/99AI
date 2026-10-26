import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { PACKAGE_BILLING_CYCLES, PACKAGE_PLAN_TYPES } from '../package.entity';

export class CreatePackageDto {
  @ApiProperty({
    example: 'pro-monthly',
    description: '套餐内部名称；为空时按方案名和规格名自动生成',
    required: false,
  })
  @IsOptional()
  @IsString({ message: '套餐名称必须是字符串' })
  name?: string;

  @ApiProperty({
    example: '后台备注',
    description: '后台备注，不作为用户端权益列表来源',
    required: false,
  })
  @IsOptional()
  @IsString({ message: '套餐备注必须是字符串' })
  des?: string;

  @ApiProperty({ example: 'pro', description: '方案标识', required: true })
  @IsString({ message: '方案标识必须是字符串' })
  @Matches(/^[a-zA-Z0-9_-]{2,64}$/, {
    message: '方案标识只能包含字母、数字、下划线和短横线，长度 2-64',
  })
  planKey: string;

  @ApiProperty({ example: '专业版', description: '方案名称', required: true })
  @IsString({ message: '方案名称必须是字符串' })
  planName: string;

  @ApiProperty({ example: '适合稳定使用 AI 的个人用户', description: '方案说明', required: false })
  @IsOptional()
  @IsString({ message: '方案说明必须是字符串' })
  planDescription?: string;

  @ApiProperty({ example: 'sparkles', description: '方案图标', required: false })
  @IsOptional()
  @IsString({ message: '方案图标必须是字符串' })
  planIcon?: string;

  @ApiProperty({
    example: 'membership',
    description: '方案类型 membership：周期会员 credit_pack：积分包',
    enum: PACKAGE_PLAN_TYPES,
  })
  @IsIn(PACKAGE_PLAN_TYPES, { message: '方案类型错误' })
  planType: 'membership' | 'credit_pack';

  @ApiProperty({ example: '每天 100 次对话\n支持常用模型', description: '用户端权益列表' })
  @IsOptional()
  @IsString({ message: '权益文案必须是字符串' })
  featureText?: string;

  @ApiProperty({ example: '月付', description: '规格名称', required: true })
  @IsString({ message: '规格名称必须是字符串' })
  variantName: string;

  @ApiProperty({
    example: 'month',
    description: '周期 day|week|month|year|one_time',
    enum: PACKAGE_BILLING_CYCLES,
  })
  @IsIn(PACKAGE_BILLING_CYCLES, { message: '周期类型错误' })
  billingCycle: 'day' | 'week' | 'month' | 'year' | 'one_time';

  @ApiProperty({ example: 1, description: '周期数量' })
  @Type(() => Number)
  @IsInt({ message: '周期数量必须为整数' })
  @Min(1, { message: '周期数量不能小于1' })
  @Max(1200, { message: '周期数量过大' })
  billingCycleCount: number;

  @ApiProperty({ example: 10, description: '规格排序，数字越小越靠前', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '规格排序必须为整数' })
  variantOrder?: number;

  @ApiProperty({ example: 1, description: '是否默认规格 0：否 1：是', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '默认规格状态必须为整数' })
  @IsIn([0, 1], { message: '默认规格状态错误' })
  isDefaultVariant?: number;

  @ApiProperty({ example: '推荐', description: '规格角标', required: false })
  @IsOptional()
  @IsString({ message: '规格角标必须是字符串' })
  badgeText?: string;

  @ApiProperty({ example: 7, default: 0, description: '套餐等级设置' })
  @Type(() => Number)
  @IsNumber({}, { message: '套餐等级权重必须为数字' })
  @Min(0, { message: '套餐等级权重不能小于0' })
  weight: number;

  @ApiProperty({ example: 99.99, description: '套餐价格(CNY)', required: true })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: '套餐价格必须为数字' })
  @Min(0, { message: '套餐价格不能小于0' })
  price: number;

  @ApiProperty({ example: 9.99, description: '套餐价格(USD)', required: false })
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  })
  @IsOptional()
  @IsNumber({}, { message: '套餐美元价格必须为数字' })
  @Min(0, { message: '套餐美元价格不能小于0' })
  priceUsd?: number;

  @ApiProperty({ example: 100, description: '套餐排序、数字越大越靠前' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '套餐排序必须为数字' })
  order?: number;

  @ApiProperty({
    example: 1,
    description: '套餐状态 0：禁用 1：启用',
    required: true,
  })
  @Type(() => Number)
  @IsNumber({}, { message: '套餐状态必须是Number' })
  @IsIn([0, 1], { message: '套餐状态错误' })
  status: number;

  @ApiProperty({
    example: 7,
    default: 0,
    description: '套餐有效期天数，由会员周期自动计算；积分包固定为0',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '套餐有效期天数类型必须是number' })
  @Min(0, { message: '套餐有效期不能小于0' })
  @Max(36500, { message: '套餐有效期过长' })
  days?: number;

  @ApiProperty({ example: 1000, default: 0, description: '积分数量' })
  @Type(() => Number)
  @IsNumber({}, { message: '积分数量必须是number类型' })
  @Min(0, { message: '积分数量不能小于0' })
  credits: number;
}
