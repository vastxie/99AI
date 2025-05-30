import { ApiProperty } from '@nestjs/swagger';

export class SetModelDto {
  @ApiProperty({ example: 1, description: 'key id', required: false })
  id: number;

  @ApiProperty({ example: 1, description: '模型类型', required: true })
  keyType: number;

  @ApiProperty({ example: '默认', description: '模型中文名称', required: true })
  modelName: string;

  @ApiProperty({ example: 'sk-', description: '模型key', required: false })
  key: any;

  @ApiProperty({
    example: true,
    description: '是否开启当前key对应的模型',
    required: true,
  })
  status: boolean;

  @ApiProperty({
    example: 'gpt-3.5',
    description: '当前key绑定的模型是多少 需要调用的模型',
    required: true,
  })
  model: string;

  @ApiProperty({ example: 1, description: '模型排序' })
  modelOrder: number;

  @ApiProperty({ example: 'https://***.png', required: false })
  modelAvatar: string;

  @ApiProperty({
    example: 4096,
    description: '模型支持的最大TOken数量',
    required: false,
  })
  maxModelTokens: number;

  @ApiProperty({
    example: true,
    description: '模型的代理地址',
    required: false,
  })
  proxyUrl: string;

  @ApiProperty({ example: 300, description: '模型超时时间', required: false })
  timeout: number;

  @ApiProperty({ example: true, description: 'key状态', required: false })
  keyStatus: number;

  @ApiProperty({
    example: true,
    description: '扣费类型 1： 普通 2： 高级余额',
    required: false,
  })
  deductType: number;

  @ApiProperty({ example: true, description: '单次扣除金额', required: false })
  deduct: number;

  @ApiProperty({
    example: true,
    description: '最大上下文轮次',
    required: false,
  })
  maxRounds: number;

  @ApiProperty({
    example: true,
    description: '是否设置为绘画Key',
    required: false,
  })
  isDraw: boolean;

  @ApiProperty({
    example: true,
    description: '是否支持文件上传',
    required: false,
  })
  isFileUpload: number;

  @ApiProperty({
    example: true,
    description: '是否使用token计费',
    required: false,
  })
  isTokenBased: boolean;

  @ApiProperty({ example: true, description: 'token计费比例', required: false })
  tokenFeeRatio: number;
}
