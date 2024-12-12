import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddBadWordDto {
	@ApiProperty({ example: 'test', description: '敏感词', required: true })
	word: string;
}
