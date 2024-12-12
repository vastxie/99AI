import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DelAutoReplyDto {
	@ApiProperty({ example: 1, description: '自动回复id', required: true })
	id: number;
}
