import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity('sensitive_whitelist')
export class WhitelistEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255, nullable: false, unique: true, comment: '白名单词语' })
  word: string;

  @Column({ type: 'text', nullable: true, comment: '备注说明' })
  remark: string;
}
