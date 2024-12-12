import { IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UseCramiDto {
	@ApiProperty({ example: 'ffar684rv254fs4f', description: '卡密信息', required: true })
	@IsDefined({ message: '套餐名称是必传参数' })
	code: string;
}
