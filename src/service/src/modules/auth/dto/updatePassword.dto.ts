import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  // @ApiProperty({ example: '123456', description: '用户旧密码' })
  // @IsNotEmpty({ message: '用户密码不能为空！' })
  // @MinLength(6, { message: '用户密码最低需要大于6位数！' })
  // @MaxLength(30, { message: '用户密码最长不能超过30位数！' })
  // oldPassword: string;

  @ApiProperty({ example: '666666', description: '用户更新新密码' })
  @IsNotEmpty({ message: '用户密码不能为空！' })
  @MinLength(6, { message: '用户密码最低需要大于6位数！' })
  @MaxLength(30, { message: '用户密码最长不能超过30位数！' })
  password: string;
}
