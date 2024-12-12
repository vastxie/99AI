import { IsNotEmpty, MinLength, MaxLength, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateUserDto {
  @ApiProperty({ example: 'cooper', nullable: true, description: '用户名称', required: false })
  @MinLength(2, { message: '用户名最低需要大于2位数！' })
  @MaxLength(12, { message: '用户名不得超过12位！' })
  @IsNotEmpty({ message: '用户名不能为空！' })
  @IsOptional()
  username?: string;

  @ApiProperty({ example: '', description: '用户头像', required: false })
  @IsNotEmpty({ message: '用户头像不能为空！' })
  @IsOptional()
  avatar?: string;

  @ApiProperty({
    example: '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。',
    description: '用户签名',
    required: false,
  })
  @IsNotEmpty({ message: '用户签名不能为空！' })
  @IsOptional()
  sign?: string;
}
