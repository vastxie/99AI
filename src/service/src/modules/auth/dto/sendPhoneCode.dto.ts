import { IsNotEmpty, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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
