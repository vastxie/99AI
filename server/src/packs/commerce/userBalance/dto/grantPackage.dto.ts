import { Type } from 'class-transformer';
import { IsDefined, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GrantPackageDto {
  @ApiProperty({ example: 1, description: '用户id', required: true })
  @IsDefined({ message: '用户id是必传参数' })
  @Type(() => Number)
  @IsInt({ message: '用户id必须是整数' })
  @Min(1, { message: '用户id必须大于0' })
  userId: number;

  @ApiProperty({ example: 12, description: '套餐id', required: true })
  @IsDefined({ message: '套餐id是必传参数' })
  @Type(() => Number)
  @IsInt({ message: '套餐id必须是整数' })
  @Min(1, { message: '套餐id必须大于0' })
  packageId: number;
}
