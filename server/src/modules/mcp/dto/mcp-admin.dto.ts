import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class McpToolFilterDto {
  @ApiPropertyOptional({ example: ['search_*'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  allow?: string[];

  @ApiPropertyOptional({ example: ['delete_*'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  deny?: string[];
}

/** 后台保存的一台 MCP 服务器；headers / env / identitySecret 可以是脱敏值，表示沿用原值 */
export class McpServerInputDto {
  @ApiProperty({ example: 'docs' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,31}$/u, {
    message: '服务器名只允许小写字母、数字、_ 和 -，最长 32 位',
  })
  name: string;

  @ApiProperty({ enum: ['http', 'stdio'] })
  @IsIn(['http', 'stdio'])
  transport: 'http' | 'stdio';

  @ApiPropertyOptional({ example: 'https://mcp.example.com/mcp' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ description: '请求头；值为脱敏形态时沿用原值' })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'stdio 命令的绝对路径，需在 MCP_STDIO_COMMAND_ALLOWLIST 中放行',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  command?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  args?: string[];

  @ApiPropertyOptional({ description: 'stdio 子进程环境变量；值为脱敏形态时沿用原值' })
  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cwd?: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ example: 60000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600000)
  timeoutMs?: number;

  @ApiPropertyOptional({ example: 60000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(86400000)
  toolsCacheTtlMs?: number;

  @ApiProperty({ description: '是否在调用元数据里透传当前用户身份' })
  @IsBoolean()
  passIdentity: boolean;

  @ApiPropertyOptional({ description: '身份签名密钥；脱敏形态表示沿用原值，空字符串表示清除' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  identitySecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ type: McpToolFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => McpToolFilterDto)
  tools?: McpToolFilterDto;
}

export class SaveMcpServersDto {
  @ApiProperty({ type: [McpServerInputDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => McpServerInputDto)
  servers: McpServerInputDto[];

  /** 读取时拿到的修订号；缺省由服务层回 409（提示刷新），不在这里变成 400 */
  @ApiPropertyOptional({ description: '读取时的修订号' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  revision?: string;

  /** 已确认丢弃后台配置里无法解析的条目 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  discardInvalid?: boolean;
}
