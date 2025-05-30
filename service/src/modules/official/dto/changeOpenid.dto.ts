import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class ChangeOpenidDto {
  @ApiProperty({ description: '原公众号AppID（不提供则使用存储的原appid）', required: false })
  @IsString()
  @IsOptional()
  from_appid?: string;

  @ApiProperty({
    description: 'OpenID列表（不提供则使用已保存的全部OpenID）',
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  openid_list?: string[];
}
