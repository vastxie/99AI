import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryAutoReplyDto {
	@ApiProperty({ example: 1, description: '查询页数', required: false })
	@IsOptional()
	page: number;

	@ApiProperty({ example: 10, description: '每页数量', required: false })
	@IsOptional()
	size: number;

	@ApiProperty({ example: '你是谁', description: '提问问题', required: false })
	@IsOptional()
	prompt: string;

	@ApiProperty({ example: 1, description: '问题状态', required: false })
	@IsOptional()
	status: number;
}
