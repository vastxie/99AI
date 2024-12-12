import { IsNotEmpty, MinLength, MaxLength, IsEmail, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryAllUserDto {
  @ApiProperty({ example: 1, description: '查询页数', required: false })
  @IsOptional()
  page: number;

  @ApiProperty({ example: 10, description: '每页数量', required: false })
  @IsOptional()
  size: number;

  @ApiProperty({ example: '小九', description: '用户姓名', required: false })
  @IsOptional()
  username: string;

  @ApiProperty({ example: 'J_longyan@163.com', description: '用户邮箱', required: false })
  @IsOptional()
  email: string;

  @ApiProperty({ example: '18888888888', description: '用户手机号码', required: false })
  @IsOptional()
  phone: string;
  
  @ApiProperty({ example: 2, description: '用户状态', required: false })
  @IsOptional()
  status: number;

  @ApiProperty({ example: 'super', description: '关键字查询', required: false })
  @IsOptional()
  keyword: string;
}
