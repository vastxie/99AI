import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class QueryAllUserDto extends PaginationQueryDto {
  @ApiProperty({ example: '99AI', description: '用户姓名', required: false })
  @IsOptional()
  username: string;

  @ApiProperty({
    example: 'aiweb@aiweb.com',
    description: '用户邮箱',
    required: false,
  })
  @IsOptional()
  email: string;

  @ApiProperty({
    example: '18888888888',
    description: '用户手机号码',
    required: false,
  })
  @IsOptional()
  phone: string;

  @ApiProperty({ example: 2, description: '用户状态', required: false })
  @IsOptional()
  status: number;

  @ApiProperty({ example: 'super', description: '关键字查询', required: false })
  @IsOptional()
  keyword: string;

  @ApiProperty({ example: '用户昵称', description: '用户昵称', required: false })
  @IsOptional()
  nickname: string;
}
