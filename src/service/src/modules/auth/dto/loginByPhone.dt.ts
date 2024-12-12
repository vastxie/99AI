import { IsNotEmpty, MinLength, MaxLength, IsOptional, IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class LoginByPhoneDto {
  @ApiProperty({ example: '19999999', description: '手机号' })
  @IsNotEmpty({ message: '手机号不能为空！' })
  @IsPhoneNumber('CN', { message: '手机号格式不正确！' })
  phone?: string;

  @ApiProperty({ example: '999999', description: '密码' })
  @IsNotEmpty({ message: '用户密码不能为空！' })
  @MinLength(6, { message: '用户密码最低需要大于6位数！' })
  @MaxLength(30, { message: '用户密码最长不能超过30位数！' })
  password: string;
}
