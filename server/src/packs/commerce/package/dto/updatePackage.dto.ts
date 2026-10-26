import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreatePackageDto } from './createPackage.dto';
import { Type } from 'class-transformer';

export class UpdatePackageDto extends CreatePackageDto {
  @ApiProperty({ example: 1, description: '要修改的套餐Id', required: true })
  @Type(() => Number)
  @IsNumber({}, { message: '套餐ID必须是Number' })
  id: number;
}
