import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ExtractOpenidsDto {
  @ApiProperty({ description: '批次索引（从0开始）', default: 0, required: false })
  @IsInt()
  @Min(0)
  @IsOptional()
  batch_index?: number = 0;

  @ApiProperty({ description: '每批数量（最大100）', default: 100, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  batch_size?: number = 100;
}
