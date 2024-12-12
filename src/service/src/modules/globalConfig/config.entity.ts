import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'config' })
export class ConfigEntity extends BaseEntity {
  @Column({ length: 255, comment: '配置名称', nullable: true })
  configKey: string;

  @Column({ type: 'text', comment: '配置内容', nullable: true })
  configVal: string;

  @Column({
    default: 0,
    comment: '配置是否公开，公开内容对前端项目展示  0：不公开 1：公开',
  })
  public: number;

  @Column({
    default: 0,
    comment: '配置是否加密，加密内容仅仅super权限可看 0：不加 1：加',
  })
  encry: number;

  @Column({ default: 1, comment: '配置状态 0:关闭 1：启用' })
  status: number;
}
