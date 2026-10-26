import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const USER_PROFILE_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type UserProfileRange = (typeof USER_PROFILE_RANGES)[number];

export class UserProfileQueryDto {
  @IsOptional()
  @Type(() => String)
  @IsIn(USER_PROFILE_RANGES)
  range?: UserProfileRange = '30d';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  recentLimit?: number = 10;
}
