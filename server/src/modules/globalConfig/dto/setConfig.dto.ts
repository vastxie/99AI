import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateBy,
  ValidateNested,
} from 'class-validator';

/** 配置表 configVal 是 text 列 */
export const CONFIG_VALUE_MAX_BYTES = 65535;

/** 数字与布尔值按字符串保存；对象、数组、null 等其它类型原样交给校验并被拒绝 */
export function normalizeConfigValue(value: unknown): unknown {
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
}

export function isStorableConfigValue(value: unknown): value is string {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= CONFIG_VALUE_MAX_BYTES;
}

class KeyValue {
  @ApiProperty({ example: 'siteName' })
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'configKey 只允许字母、数字、下划线' })
  configKey: string;

  @ApiProperty({
    example: 'AIWeb',
    description: '字符串；数字与布尔值按字符串保存，最多 65535 字节',
  })
  @Transform(({ value }) => normalizeConfigValue(value))
  @IsString({ message: 'configVal 只能是字符串、数字或布尔值' })
  @ValidateBy({
    name: 'maxConfigValueBytes',
    validator: {
      validate: value => isStorableConfigValue(value),
      defaultMessage: () => `configVal 不能超过 ${CONFIG_VALUE_MAX_BYTES} 字节`,
    },
  })
  configVal: string;
}

export class SetConfigDto {
  @ApiProperty({
    example: [{ configKey: 'siteName', configVal: 'AIWeb' }],
    description: '设置配置信息',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => KeyValue)
  settings: KeyValue[];
}
