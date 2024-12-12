import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class UpdateGroupDto {
  @ApiProperty({ example: 1, description: '修改的对话ID', required: false })
  @IsOptional()
  groupId: number;

  @ApiProperty({ example: 10, description: '对话组title', required: false })
  @IsOptional()
  title: string;

  @ApiProperty({ example: 10, description: '对话组是否置顶', required: false })
  @IsOptional()
  isSticky: boolean;

  @ApiProperty({ example: '', description: '对话组文件地址', required: false })
  @IsOptional()
  fileUrl: string;

  @ApiProperty({
    example: '',
    description: '对话模型配置项序列化的字符串',
    required: false,
  })
  config: string;
}
