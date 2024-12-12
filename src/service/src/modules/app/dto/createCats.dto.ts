import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsIn, IsNumber, IsOptional } from 'class-validator';

export class CreateCatsDto {
  @ApiProperty({
    example: '编程助手',
    description: 'app分类名称',
    required: true,
  })
  @IsDefined({ message: 'app分类名称是必传参数' })
  name: string;

  @ApiProperty({
    example: 100,
    description: '分类排序、数字越大越靠前',
    required: false,
  })
  @IsOptional()
  order: number;

  @ApiProperty({
    example: 1,
    description: '分类状态 0：禁用 1：启用',
    required: true,
  })
  @IsNumber({}, { message: '状态必须是Number' })
  @IsIn([0, 1, 3, 4, 5], { message: '套餐状态错误' })
  status: number;
}
