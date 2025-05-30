import { IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendPhoneCodeDto {
  @ApiProperty({ example: '199999999', description: '手机号' })
  @IsNotEmpty({ message: '手机号不能为空' })
  @MinLength(11, { message: '手机号长度为11位' })
  @MaxLength(11, { message: '手机号长度为11位！' })
  phone?: string;

  @ApiProperty({ example: '2b4i1b4', description: '图形验证码KEY' })
  @IsNotEmpty({ message: '验证码KEY不能为空' })
  captchaId?: string;

  @ApiProperty({ example: '1g4d', description: '图形验证码' })
  @IsNotEmpty({ message: '验证码不能为空' })
  captchaCode?: string;
}
