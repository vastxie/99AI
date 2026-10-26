import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'alice',
    description: '用户名（2-12 位，字母 / 数字 / 下划线 / 短横 / 点）',
  })
  @IsNotEmpty({ message: '用户名不能为空！' })
  @IsString({ message: '用户名必须是字符串！' })
  @MinLength(2, { message: '用户名最短是两位数！' })
  @MaxLength(12, { message: '用户名最长不得超过12位！' })
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: '用户名只能包含字母、数字、下划线、短横和点！' })
  username: string;

  @ApiProperty({ example: '123456', description: '密码（6-30 位）' })
  @IsNotEmpty({ message: '密码不能为空！' })
  @IsString({ message: '密码必须是字符串！' })
  @MinLength(6, { message: '用户密码最低需要大于6位数！' })
  @MaxLength(30, { message: '用户密码最长不能超过30位数！' })
  password: string;

  @ApiProperty({ example: 'Alice', description: '昵称', required: false })
  @IsOptional()
  @IsString({ message: '昵称必须是字符串！' })
  @MaxLength(32, { message: '昵称最长不得超过32位！' })
  nickname?: string;
}
