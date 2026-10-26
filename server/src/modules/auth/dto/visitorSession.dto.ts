import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class VisitorSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  language?: string;
}
