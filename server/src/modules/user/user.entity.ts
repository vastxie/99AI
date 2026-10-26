import { BaseEntity } from '@/common/entity/baseEntity';
import { createStorageId } from '@/common/utils';
import { BeforeInsert, Column, Entity, Index } from 'typeorm';

@Entity({ name: 'users' })
@Index(['role', 'status']) // 角色和状态联合查询
export class UserEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 12, nullable: true, comment: '用户对外标识' })
  uid: string;

  @Index({ unique: true })
  @Column({ length: 24, nullable: true, select: false, comment: '用户私有文件存储分区标识' })
  storageId: string;

  @Column({ length: 48, nullable: true, select: false, comment: '用户头像 FileAsset ID' })
  avatarFileId: string;

  @Column({ length: 12, comment: '用户昵称' })
  username: string;

  @Column({ length: 64, comment: '用户密码', nullable: true, select: false })
  password: string;

  @Column({ default: 0, comment: '用户状态' })
  status: number;

  @Column({ comment: '用户昵称', nullable: true })
  nickname: string;

  @Column({ length: 191, nullable: true, comment: '用户邮箱' })
  email: string;

  @Column({ length: 64, nullable: true, comment: '用户手机号' })
  phone: string;

  @Column({
    length: 300,
    nullable: true,
    default: '',
    comment: '用户头像',
  })
  avatar: string;

  @Column({
    length: 64,
    default: '',
    comment: '最后一次登录IP',
    nullable: true,
  })
  lastLoginIp: string;

  @Column({ length: 10, default: 'viewer', comment: '用户角色' })
  role: string;

  @Column({ comment: '内容过滤命中次数', default: 0 })
  violationCount: number;

  @Column({
    length: 500,
    nullable: true,
    comment: '用户自定义指令，用于个性化AI回复',
  })
  customInstruction: string;

  @BeforeInsert()
  ensureStorageId() {
    if (!this.storageId) {
      this.storageId = createStorageId();
    }
  }
}
