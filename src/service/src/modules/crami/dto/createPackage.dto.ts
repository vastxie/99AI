import {
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsString,
  IsIn,
  IsOptional,
  Max,
  Min,
  ValidateNested,
  IsNumber,
  IsDefined,
  IsDecimal,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class CreatePackageDto {
  @ApiProperty({ example: '基础套餐100次卡', description: '套餐名称', required: true })
  @IsDefined({ message: '套餐名称是必传参数' })
  name: string;

  @ApiProperty({
    example: '这是一个100次对话余额的套餐，我们将为您额外赠送3次绘画余额，活动期间，我们将在套餐基础上额外赠送您十次对话余额和1次绘画余额',
    description: '套餐详情描述',
    required: true,
  })
  @IsDefined({ message: '套餐描述是必传参数' })
  des: string;

  @ApiProperty({ example: 7, default: 0, description: '套餐等级设置' })
  @IsNumber({}, { message: '套餐等级权重必须为数字' })
  weight: number;

  @ApiProperty({ example: 1, description: '套餐扣费类型 1：按次数 2：按Token', required: true })
  deductionType: number;

  @ApiProperty({ example: 'https://xxxx.png', description: '套餐封面图片' })
  @IsOptional()
  coverImg: string;

  @Transform(({ value }) => parseFloat(value))
  price: number;

  @ApiProperty({ example: 100, description: '套餐排序、数字越大越靠前' })
  @IsOptional()
  order?: number;

  @ApiProperty({ example: 1, description: '套餐状态 0：禁用 1：启用', required: true })
  @IsNumber({}, { message: '套餐状态必须是Number' })
  @IsIn([0, 1], { message: '套餐状态错误' })
  status: number;

  @ApiProperty({ example: 7, default: 0, description: '套餐有效期 -1为永久不过期' })
  @IsNumber({}, { message: '套餐有效期天数类型必须是number' })
  days: number;

  @ApiProperty({ example: 1000, default: 0, description: '模型3对话次数' })
  @IsNumber({}, { message: '模型3对话次数必须是number类型' })
  model3Count: number;

  @ApiProperty({ example: 10, default: 0, description: '模型4对话次数' })
  @IsNumber({}, { message: '模型4对话次数必须是number类型' })
  model4Count: number;

  @ApiProperty({ example: 10, default: 0, description: 'MJ绘画次数' })
  @IsNumber({}, { message: 'MJ绘画次数必须是number类型' })
  drawMjCount: number;

  // @ApiProperty({ example: 0, description: '卡密携带的用户余额金额' })
  // @IsNumber({}, { message: '卡密余额类型必须是number' })
  // balance: number;

  // @ApiProperty({ example: 100, description: '卡密携带的用户对话次数' })
  // @IsNumber({}, { message: '对话次数类型必须是number' })
  // usesLeft: number;

  // @ApiProperty({ example: 3, description: '卡密携带的用户绘画次数' })
  // @IsNumber({}, { message: '绘画次数类型必须是number' })
  // paintCount: number;

  // @ApiProperty({ example: 1, description: '是否开启额外赠送状态 0：关闭 1：开启' })
  // @IsNumber({}, { message: '是否开启额外赠送状态必须是Number' })
  // @IsIn([0, 1], { message: '是否开启额外赠送状态只能是0或1' })
  // @IsOptional()
  // extraReward: number;

  // @ApiProperty({ example: 0, description: '卡密携带的额外赠送用户余额金额' })
  // @IsNumber({}, { message: '额外赠送卡密余额类型必须是number' })
  // @IsOptional()
  // extraBalance: number;

  // @ApiProperty({ example: 10, description: '卡密携带的额外赠送用户对话次数' })
  // @IsNumber({}, { message: '额外赠送对话次数类型必须是number' })
  // @IsOptional()
  // extraUsesLeft: number;

  // @ApiProperty({ example: 1, description: '卡密携带的额外赠送用户绘画次数' })
  // @IsNumber({}, { message: '额外赠送绘画次数类型必须是number' })
  // @IsOptional()
  // extraPaintCount: number;
}
