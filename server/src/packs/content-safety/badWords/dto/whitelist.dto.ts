import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** 白名单删改必须带有效编号：空编号会让查询命中任意一行、写入条件失效 */
export class WhitelistIdDto {
  @ApiProperty({ example: 1, description: '白名单记录 ID' })
  @Type(() => Number)
  @IsInt({ message: '白名单记录 ID 无效' })
  @Min(1, { message: '白名单记录 ID 无效' })
  id: number;
}

export class UpdateWhitelistDto extends WhitelistIdDto {
  @ApiProperty({ example: '示例词', description: '白名单词语', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  word?: string;

  @ApiProperty({ example: '误伤词', description: '备注说明', required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}
