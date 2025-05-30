import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ConfirmMigrationDto {
  @ApiProperty({ description: '是否确认迁移', default: true })
  @IsBoolean()
  @IsNotEmpty()
  confirm: boolean;
}
