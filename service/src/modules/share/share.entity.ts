import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('share')
export class Share {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 8, unique: true })
  shareCode: string;

  @Column('mediumtext')
  htmlContent: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
