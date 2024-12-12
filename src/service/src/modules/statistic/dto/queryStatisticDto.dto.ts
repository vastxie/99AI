import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryStatisticDto {
	@ApiProperty({ example: 7, description: '查询最近N天的数据', required: true })
	days: number;
}
