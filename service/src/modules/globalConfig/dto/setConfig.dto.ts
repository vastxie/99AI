import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';

interface KeyValue {
  configKey: string;
  configVal: any;
}

export class SetConfigDto {
  @ApiProperty({
    example: [{ configKey: 'siteName', configVal: 'AIWeb' }],
    description: '设置配置信息',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => Object)
  settings: KeyValue[];
}
