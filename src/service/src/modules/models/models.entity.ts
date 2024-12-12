import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'models' })
export class ModelsEntity extends BaseEntity {
  @Column({ comment: '模型类型 1: 普通对话 2: 绘画  3:高级对话' })
  keyType: number;

  @Column({ comment: '模型名称' })
  modelName: string;

  @Column({ comment: '绑定的模型是？' })
  model: string;

  @Column({ length: 1024, comment: '模型头像', nullable: true })
  modelAvatar: string;

  @Column({ comment: '模型排序', default: 1 })
  modelOrder: number;

  @Column({
    comment: '模型上下文支持的最大Token',
    default: 2000,
    nullable: true,
  })
  maxModelTokens: number;

  @Column({ comment: '模型上下文最大条数', nullable: true })
  maxRounds: number;

  @Column({ comment: '模型上下文最大条数', nullable: true })
  timeout: number;

  @Column({ comment: '模型单次调用扣除的次数', default: 1 })
  deduct: number;

  @Column({ comment: '模型扣除余额类型 1: 普通模型 2: 高级模型', default: 1 })
  deductType: number;

  @Column({ comment: '是否使用token计费: 0:不是 1: 是', default: 0 })
  isTokenBased: boolean;

  @Column({
    comment: '是否支持文件上传: 0:不是 1: 附件链接格式 2: 4V格式',
    default: 0,
  })
  isFileUpload: number;

  @Column({ comment: 'token计费比例', default: 0 })
  tokenFeeRatio: number;

  @Column({ comment: '模型附加信息', nullable: true })
  remark: string;

  @Column({ comment: '模型的key', nullable: true })
  key: string;

  @Column({ comment: '使用的状态: 0:禁用 1：启用', default: 1 })
  status: boolean;

  @Column({
    comment: 'key的状态: 1:有效  -1:被封号 -2: 错误的秘钥 -3: 余额使用完了',
    default: 1,
  })
  keyStatus: number;

  @Column({ comment: 'key的使用次数', default: 0 })
  useCount: number;

  @Column({ comment: 'key的已经使用的token数量', default: 0 })
  useToken: number;

  @Column({ comment: '当前模型的代理地址', nullable: true })
  proxyUrl: string;

  @Column({ comment: '模型频率限制 次/小时', default: 999 })
  modelLimits: number;

  @Column({ comment: '模型介绍', nullable: true })
  modelDescription: string;
}
