import { IsNotEmpty, MinLength, MaxLength, IsEmail, IsOptional, IsNumber, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UserRechargeDto {
  @ApiProperty({ example: 1, description: '用户id', required: true })
  @IsDefined({ message: '用户id是必传参数' })
  userId: number;

  @ApiProperty({ example: 100, description: '用户对话模型3次数', required: false })
  @IsOptional()
  model3Count?: number;

  @ApiProperty({ example: 5, description: '用户对话模型4次数', required: false })
  @IsOptional()
  model4Count?: number;

  @ApiProperty({ example: 0, description: '用户MJ额度', required: false })
  @IsOptional()
  drawMjCount?: number;
}
