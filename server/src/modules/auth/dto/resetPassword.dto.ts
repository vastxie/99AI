import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: '找回密码时使用的联系方式' })
  @IsNotEmpty({ message: '联系方式不能为空！' })
  @IsString({ message: '联系方式必须是字符串！' })
  @MinLength(5, { message: '联系方式格式不正确！' })
  @MaxLength(50, { message: '联系方式格式不正确！' })
  contact: string;

  @ApiProperty({ description: '验证码校验通过后下发的一次性重置凭证' })
  @IsNotEmpty({ message: '请先完成验证码验证！' })
  @IsString({ message: '重置凭证必须是字符串！' })
  @MinLength(16, { message: '重置凭证格式不正确！' })
  @MaxLength(128, { message: '重置凭证格式不正确！' })
  resetToken: string;

  @ApiProperty({ example: '123456', description: '新密码（6-30 位）' })
  @IsNotEmpty({ message: '新密码不能为空！' })
  @IsString({ message: '密码必须是字符串！' })
  @MinLength(6, { message: '密码最低需要大于6位数！' })
  @MaxLength(30, { message: '密码最长不能超过30位数！' })
  password: string;
}
