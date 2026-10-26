import { CHAT_GROUP_GID_PATTERN } from '@/common/utils/createChatGroupGid';
import { CHAT_LOG_CID_PATTERN } from '@/common/utils/createChatLogCid';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Max,
  Min,
  ValidateNested,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const CHAT_SUBMISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,95}$/;

export class Options {
  @ApiProperty({ example: 0, description: '父消息ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'parentMessageId必须是数字' })
  parentMessageId?: number;

  @ApiProperty({ example: 'gpt-3.5-turbo', description: '使用的模型', required: false })
  @IsOptional()
  @IsString({ message: 'model必须是字符串' })
  model?: string;

  @ApiProperty({ example: 1.0, description: 'top_p参数', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'top_p必须是数字' })
  top_p?: number;
}

export class ChatProcessDto {
  @ApiProperty({
    example: '019fa3d8-4321-7a00-9000-123456789abc',
    description: '本次用户动作的幂等提交 ID',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'submissionId必须是字符串' })
  @Matches(CHAT_SUBMISSION_ID_PATTERN, { message: 'submissionId格式无效' })
  submissionId?: string;

  @ApiProperty({ example: 'hello, Who are you', description: '对话信息' })
  @IsNotEmpty({ message: '提问信息不能为空！' })
  @IsString({ message: 'prompt必须是字符串' })
  prompt: string;

  @ApiProperty({
    example: { parentMessageId: 0 },
    description: '上次对话信息',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => Options)
  options?: Options;

  @ApiProperty({
    example:
      "You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully. Respond using markdown.",
    description: '系统预设信息',
  })
  @IsOptional()
  @IsString({ message: 'systemMessage必须是字符串' })
  systemMessage?: string;

  @ApiProperty({
    example: 1,
    description: '模型ID（优先使用，比model更可靠）',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'modelId必须是数字' })
  modelId?: number;

  @ApiProperty({
    example: 'gpt-3.5-turbo',
    description: '模型名称；与模型 ID 同时提供时使用模型 ID',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'model必须是字符串' })
  model?: string;

  @ApiProperty({
    example:
      '[{"type":"image","url":"http://example.com/img.jpg"},{"type":"file","url":"http://example.com/file.pdf","name":"file.pdf"}]',
    description: '统一URL参数（JSON格式）',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'url必须是字符串' })
  url?: string;

  @ApiProperty({ example: '[]', description: 'FileAsset 文件列表（JSON 格式）', required: false })
  @IsOptional()
  @IsString({ message: 'files必须是字符串' })
  files?: string;

  @ApiProperty({ example: '[]', description: '消息附件列表（JSON 格式）', required: false })
  @IsOptional()
  @IsString({ message: 'attachments必须是字符串' })
  attachments?: string;

  @ApiProperty({ example: 'GPT-4o', description: '模型展示名称', required: false })
  @IsOptional()
  @IsString({ message: 'modelName必须是字符串' })
  modelName?: string;

  @ApiProperty({
    example: 'medium',
    description:
      '推理强度（off/minimal/low/medium/high/xhigh/max；不支持或非法值回落到模型默认档位）',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'reasoningEffort必须是字符串' })
  reasoningEffort?: string;

  @ApiProperty({ example: '{}', description: '前端统一消息结构', required: false })
  @IsOptional()
  @IsString({ message: 'message必须是字符串' })
  message?: string;

  @ApiProperty({ example: 'msg_123', description: '外部通道消息 ID', required: false })
  @IsOptional()
  @IsString({ message: 'channelMessageId必须是字符串' })
  channelMessageId?: string;

  @ApiProperty({ example: 'turn_abc123', description: '接续来源 Turn ID', required: false })
  @IsOptional()
  @IsString({ message: 'parentTurnId必须是字符串' })
  parentTurnId?: string;

  @ApiProperty({
    example: 'c_AbC123xYz7890abcdefghi',
    description:
      '重新生成 / 编辑重发：从这条提问起替换原有回合。新一轮通过预检、写入时在同一事务里软删这条及其后的记录，没被接受时原记录保留',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'replaceFromCid必须是字符串' })
  @Matches(CHAT_LOG_CID_PATTERN, { message: 'replaceFromCid格式无效' })
  replaceFromCid?: string;

  @ApiProperty({
    example: 2,
    description:
      '替换时用户确认要一并删除的后续轮数（这条提问之后的提问数）；与服务端实际不符时拒绝并告知实际轮数',
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'replaceLaterTurns必须是整数' })
  @Min(0, { message: 'replaceLaterTurns不能为负数' })
  @Max(100000, { message: 'replaceLaterTurns过大' })
  replaceLaterTurns?: number;

  @ApiProperty({
    example: 'g_0123456789abcdefghijklmn',
    description: '对话组 gid',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'gid必须是字符串' })
  @Matches(CHAT_GROUP_GID_PATTERN, { message: 'gid格式无效' })
  gid?: string;

  @ApiProperty({ example: 'workflow_action', description: '工作流动作', required: false })
  @IsOptional()
  @IsString({ message: 'action必须是字符串' })
  action?: string;

  @IsOptional()
  @IsString({ message: '__clientIp必须是字符串' })
  __clientIp?: string;

  @IsOptional()
  @IsString({ message: '__socketId必须是字符串' })
  __socketId?: string;
}
