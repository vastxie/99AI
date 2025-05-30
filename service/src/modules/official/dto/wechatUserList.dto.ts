import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class WechatUserListDto {
  @ApiProperty({ description: '下一个openid', required: false })
  @IsString()
  @IsOptional()
  next_openid?: string;
}
