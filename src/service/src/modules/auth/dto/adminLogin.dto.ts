import { IsNotEmpty, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AdminLoginDto {
  @ApiProperty({ example: 'super', description: '邮箱' })
  @IsNotEmpty({ message: '用户名不能为空！' })
  @MinLength(2, { message: '用户名最短是两位数！' })
  @MaxLength(30, { message: '用户名最长不得超过30位！' })
  @IsOptional()
  username?: string;

  @ApiProperty({ example: '999999', description: '密码' })
  @IsNotEmpty({ message: '用户密码不能为空！' })
  @MinLength(6, { message: '用户密码最低需要大于6位数！' })
  @MaxLength(30, { message: '用户密码最长不能超过30位数！' })
  password: string;
}
