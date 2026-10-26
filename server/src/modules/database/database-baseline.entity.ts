import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'schema_baseline' })
export class DatabaseBaselineEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;
}
