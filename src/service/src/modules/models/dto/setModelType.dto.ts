import { ApiProperty } from '@nestjs/swagger';

export class SetModelTypeDto {
  @ApiProperty({ example: 1, description: 'model id', required: false })
  id: number;

  @ApiProperty({ example: 1, description: '模型类型', required: true })
  keyType: number;

  @ApiProperty({ example: '普通模型', description: '模型中文名称', required: true })
  modelName: string;

  @ApiProperty({ example: true, description: '是否开启当前key对应的模型', required: true })
  status: boolean;

  @ApiProperty({ example: 'gpt-3.5', description: '当前key绑定的模型是多少 需要调用的模型', required: true })
  model: string;

  @ApiProperty({ example: 300, description: '模型超时时间', required: false })
  timeout: number;

  @ApiProperty({ example: true, description: '扣费类型 1： 普通 2： 高级余额', required: false })
  deductType: number;

  @ApiProperty({ example: true, description: '文件上传类型 0 : 不使用 1: ALL类型 2: 4V类型', required: false })
  isFileUpload: number;

  @ApiProperty({ example: true, description: '单次扣除金额', required: false })
  deduct: number;

  @ApiProperty({ example: true, description: '排序id 越大越靠前', default: 100 })
  order: number;

  @ApiProperty({ example: 4000, description: '模型允许用户使用的最大token设置过高意味着单次的上下文会很高控制模型上下文控制使用token数量', required: true })
  maxTokens: number;

  @ApiProperty({ example: 1000, description: '模型支持的最大回复TOken数量', required: true })
  maxResponseTokens: number;

  @ApiProperty({ example: true, description: '最大上下文轮次', required: false })
  maxRounds: number;

  @ApiProperty({ example: true, description: '是否设置为Dall-E3绘画Key', required: false })
  isDallE3: boolean;

  @ApiProperty({ example: true, description: '是否设置为工具key', required: false })
  isUseTool: boolean;
}
