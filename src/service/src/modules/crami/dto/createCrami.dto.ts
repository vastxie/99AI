import {
  IsNotEmpty,
  IsString,
  IsIn,
  IsOptional,
  IsNumber,
  IsDefined,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatCramiDto {
  @ApiProperty({ example: 1, description: '套餐类型', required: true })
  @IsNumber({}, { message: '套餐类型必须是number' })
  @IsOptional()
  packageId: number;

  @ApiProperty({ example: 1, description: '单次生成卡密数量' })
  @IsNumber({}, { message: '创建卡密的张数数量' })
  @Max(50, { message: '单次创建卡密的张数数量不能超过50张' })
  @Min(1, { message: '单次创建卡密的张数数量不能少于1张' })
  @IsOptional()
  count: number;

  @ApiProperty({ example: 0, description: '卡密携带模型3额度' })
  @IsNumber({}, { message: '卡密携带的余额必须是number' })
  @IsOptional()
  model3Count: number;

  @ApiProperty({ example: 100, description: '卡密携带模型4额度' })
  @IsNumber({}, { message: '卡密携带额度类型必须是number' })
  @IsOptional()
  model4Count: number;

  @ApiProperty({ example: 3, description: '卡密携带MJ绘画额度' })
  @IsNumber({}, { message: '卡密携带额度类型必须是number' })
  @IsOptional()
  drawMjCount: number;
}
