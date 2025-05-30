import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({
    example: 'cooper',
    nullable: true,
    description: '用户名称',
    required: false,
  })
  @MinLength(2, { message: '用户名最低需要大于2位数！' })
  @MaxLength(12, { message: '用户名不得超过12位！' })
  @IsNotEmpty({ message: '用户名不能为空！' })
  @IsOptional()
  nickname?: string;

  @ApiProperty({ example: '', description: '用户头像', required: false })
  @IsNotEmpty({ message: '用户头像不能为空！' })
  @IsOptional()
  avatar?: string;
}
