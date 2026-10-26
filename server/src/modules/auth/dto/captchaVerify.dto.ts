import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** 验证码登录 / 绑定 / 找回密码校验共用：联系方式 + 验证码 */
export class CaptchaVerifyDto {
  @ApiProperty({ example: 'user@example.com', description: '邮箱 / 手机号等联系方式' })
  @IsNotEmpty({ message: '联系方式不能为空！' })
  @IsString({ message: '联系方式必须是字符串！' })
  @MinLength(5, { message: '联系方式格式不正确！' })
  @MaxLength(50, { message: '联系方式格式不正确！' })
  contact: string;

  @ApiProperty({ example: '123456', description: '验证码' })
  @IsNotEmpty({ message: '验证码不能为空！' })
  @IsString({ message: '验证码必须是字符串！' })
  @MinLength(4, { message: '验证码格式不正确！' })
  @MaxLength(10, { message: '验证码格式不正确！' })
  code: string;
}
