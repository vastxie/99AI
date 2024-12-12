import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, Max, Min, ValidateNested, IsNumber, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CreatePackageDto } from './createPackage.dto';

export class UpdatePackageDto extends CreatePackageDto {
  @ApiProperty({ example: 1, description: '要修改的套餐Id', required: true })
  @IsNumber({}, { message: '套餐ID必须是Number' })
  id: number;
}
