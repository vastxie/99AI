import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateAppDto } from './createApp.dto';

export class UpdateAppDto extends CreateAppDto {
  @ApiProperty({ example: 1, description: '要修改的分类Id', required: true })
  @IsNumber({}, { message: '分类ID必须是Number' })
  id: number;
}
