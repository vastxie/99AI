import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class CollectAppDto {
	@ApiProperty({ example: 1, description: '要收藏的appId', required: true })
	@IsNumber({}, { message: 'ID必须是Number' })
	appId: number;
}
