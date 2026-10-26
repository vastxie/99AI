import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CaptchaSendCodeDto {
  @ApiProperty({ example: 'user@example.com', description: '邮箱 / 手机号等联系方式' })
  @IsNotEmpty({ message: '联系方式不能为空！' })
  @IsString({ message: '联系方式必须是字符串！' })
  @MinLength(5, { message: '联系方式格式不正确！' })
  @MaxLength(50, { message: '联系方式格式不正确！' })
  contact: string;

  @ApiProperty({ example: 'login', description: 'login：登录（首次自动注册）；reset：找回密码' })
  @IsIn(['login', 'reset'], { message: '验证码场景不正确！' })
  scene: 'login' | 'reset';
}

export class CaptchaSendBindCodeDto {
  @ApiProperty({ example: 'user@example.com', description: '要绑定的联系方式' })
  @IsNotEmpty({ message: '联系方式不能为空！' })
  @IsString({ message: '联系方式必须是字符串！' })
  @MinLength(5, { message: '联系方式格式不正确！' })
  @MaxLength(50, { message: '联系方式格式不正确！' })
  contact: string;
}
