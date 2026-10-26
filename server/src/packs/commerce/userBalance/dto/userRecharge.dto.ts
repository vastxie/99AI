import { Type } from 'class-transformer';
import { IsDefined, IsInt, Max, Min, NotEquals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UserRechargeDto {
  @ApiProperty({ example: 1, description: '用户id', required: true })
  @IsDefined({ message: '用户id是必传参数' })
  @Type(() => Number)
  @IsInt({ message: '用户id必须是整数' })
  @Min(1, { message: '用户id必须大于0' })
  userId: number;

  @ApiProperty({
    example: 100,
    description: '调整积分数量（正数增加，负数扣减）',
    required: true,
  })
  @IsDefined({ message: '调整积分数量是必传参数' })
  @Type(() => Number)
  @IsInt({ message: '调整积分数量必须是整数' })
  @NotEquals(0, { message: '调整积分数量不能为0' })
  @Min(-100000000, { message: '调整积分数量过大' })
  @Max(100000000, { message: '调整积分数量过大' })
  credits: number;
}
