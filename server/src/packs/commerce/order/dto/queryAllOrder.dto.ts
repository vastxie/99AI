import { PaginationQueryDto, toOptionalInteger } from '@/common/dto/pagination-query.dto';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function optionalString(value: unknown): string | undefined {
  if (value === '' || value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

export class QueryAllOrderDto extends PaginationQueryDto {
  @ApiProperty({ example: 99, description: '支付的用户id', required: false })
  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @Min(1)
  userId: number;

  @ApiProperty({ example: 'epay', description: '支付的平台', required: false })
  @IsOptional()
  @Transform(({ value }) => optionalString(value))
  @IsIn(['epay', 'wechat_official', 'alipay_official', 'paypal_official', 'stripe_official'])
  platform: string;

  @ApiProperty({ example: 1, description: '订单状态', required: false })
  @IsOptional()
  @Transform(toOptionalInteger)
  @IsInt()
  @IsIn([0, 1, 2, 3])
  status: number;
}
