import { ApiProperty } from '@nestjs/swagger';

export class SetModelDto {
  @ApiProperty({ example: 1, description: '模型ID，更新时必填', required: false })
  id?: number;

  @ApiProperty({
    example: 'GPT-3.5 Turbo',
    description: '模型中文名称（显示名称）',
    required: true,
  })
  modelName: string;

  @ApiProperty({
    example: 'gpt-3.5-turbo',
    description: '模型标识（API调用使用的模型名）',
    required: true,
  })
  model: string;

  @ApiProperty({
    example: 'sk-xxx1',
    description: 'API密钥',
    required: false,
  })
  key?: string;

  @ApiProperty({
    example: 'openai_chat_completions',
    description: '模型调用协议',
    required: false,
  })
  protocol?: string;

  @ApiProperty({
    example: 'https://api.openai.com',
    description: '模型 API 基础地址',
    required: false,
  })
  baseUrl?: string;

  @ApiProperty({
    example: {
      streaming: true,
      toolCalling: true,
      vision: true,
      reasoningControl: {
        levels: ['off', 'low', 'medium', 'high'],
        defaultLevel: 'medium',
      },
    },
    description: '模型能力配置',
    required: false,
  })
  capabilities?: any;

  @ApiProperty({
    example: '/v1/chat/completions',
    description: '高级自定义 endpoint path',
    required: false,
  })
  endpointPath?: string;

  @ApiProperty({ example: true, description: '是否启用当前模型', required: true })
  status: boolean;

  @ApiProperty({ example: 1, description: '模型排序（数字越小越靠前）', required: false })
  modelOrder?: number;

  @ApiProperty({
    example: 'https://example.com/avatar.png',
    description: '模型头像URL',
    required: false,
  })
  modelAvatar?: string;

  @ApiProperty({ example: 1, description: '密钥状态（1:正常 2:禁用）', required: false })
  keyStatus?: number;

  @ApiProperty({ example: 0.001, description: '单次扣除金额', required: false })
  deduct?: number;

  @ApiProperty({
    example: 64000,
    description: '模型最大Token数（用于上下文预算控制）',
    required: false,
  })
  maxModelTokens?: number;

  @ApiProperty({
    example: ['image_url', 'document', 'video_url'],
    description:
      '多模态类型: image_url(图片分析), document(PDF文档分析), video_url(视频分析), audio_url(音频分析)',
    required: false,
  })
  multimodalTypes?: string[];

  @ApiProperty({ example: false, description: '是否使用Token计费', required: false })
  isTokenBased?: boolean;

  @ApiProperty({
    example: 0.1,
    description: 'Token计费比例（相对于基础费率的比例）',
    required: false,
  })
  tokenFeeRatio?: number;

  @ApiProperty({ example: '这是一个强大的GPT模型', description: '模型描述', required: false })
  modelDescription?: string;

  @ApiProperty({
    example: '',
    description: '模型附加参数（JSON格式，会合并到API调用参数中）',
    required: false,
  })
  additionalParams?: string;
}
