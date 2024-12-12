import { IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RedisDto {
	@ApiProperty({ example: 'name', description: '邮箱' })
	key: string;

	@ApiProperty({ example: '123456', description: '密码' })
	@IsNotEmpty({ message: '用户密码不能为空！' })
	val: string;
}
