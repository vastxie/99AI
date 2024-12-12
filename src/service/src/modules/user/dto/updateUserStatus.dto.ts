import { IsNotEmpty, IsDefined, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateUserStatusDto {
	@ApiProperty({ example: 2, description: '用户状态', required: false })
	@IsNotEmpty({ message: '用户状态不能为空！' })
	@IsDefined({ message: '用户状态是必传参数' })
	@IsIn([0, 1, 2, 3], { message: '非法参数、用户状态非法！' })
	status: number;

	@ApiProperty({ example: 1, description: '修改的用户id', required: false })
	@IsDefined({ message: '用户id是必传参数' })
	id: number;
}
