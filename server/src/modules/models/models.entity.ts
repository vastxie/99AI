import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';
import type { ModelGatewayCapabilities } from '../modelGateway/model-gateway.types';

@Entity({ name: 'models' })
@Index(['status']) // 模型状态索引
@Index(['modelOrder']) // 排序查询
export class ModelsEntity extends BaseEntity {
  @Column({ comment: '模型名称' })
  modelName: string;

  @Column({ comment: '绑定的模型是？' })
  model: string;

  @Column({ type: 'text', comment: '模型头像', nullable: true })
  modelAvatar: string;

  @Column({ comment: '模型排序', default: 1 })
  modelOrder: number;

  @Column({ comment: '模型单次调用扣除的次数', default: 1 })
  deduct: number;

  @Column({ comment: '是否使用token计费: 0:不是 1: 是', default: 0 })
  isTokenBased: boolean;

  @Column({ comment: '模型调用协议', default: 'openai_chat_completions' })
  protocol: string;

  @Column({ comment: '模型 API 基础地址', nullable: true })
  baseUrl: string;

  @Column({ type: 'json', comment: '模型能力配置', nullable: true })
  capabilities: ModelGatewayCapabilities;

  @Column({ comment: '高级自定义 endpoint path', nullable: true })
  endpointPath: string;

  @Column({
    comment: '多模态类型 JSON 数组，如 ["image_url", "document", "video_url", "audio_url"]',
    type: 'json',
    nullable: true,
  })
  multimodalTypes: string[];

  @Column({ comment: 'token计费比例', default: 0 })
  tokenFeeRatio: number;

  @Column({ comment: '模型附加参数', type: 'text', nullable: true })
  additionalParams: string;

  @Column({ comment: '模型的key', nullable: true })
  key: string;

  @Column({ comment: '使用的状态: 0:禁用 1：启用', default: 1 })
  status: boolean;

  @Column({ comment: 'key的使用次数', default: 0 })
  useCount: number;

  @Column({ comment: 'key的已经使用的token数量', default: 0 })
  useToken: number;

  @Column({ comment: '模型频率限制 次/小时', default: 999 })
  modelLimits: number;

  @Column({ comment: '模型最大Token数（用于上下文预算控制）', default: 64000 })
  maxModelTokens: number;

  @Column({ comment: '模型介绍', nullable: true })
  modelDescription: string;

  @Column({ type: 'text', comment: '模型system预设', nullable: true })
  systemPrompt: string;

  @Column({
    comment: '预设类型 0:关闭预设 1: 附加模式 2: 覆盖模式',
    nullable: true,
    default: 0,
  })
  systemPromptType: number;
}
