import { Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity()
export class BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'datetime', length: 0, nullable: false, name: 'createdAt', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', length: 0, nullable: false, name: 'updatedAt', comment: '更新时间' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'datetime', length: 0, nullable: false, name: 'deletedAt', comment: '删除时间' })
  deletedAt: Date;
}
