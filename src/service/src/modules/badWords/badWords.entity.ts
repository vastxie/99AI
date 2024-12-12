import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'bad_words' })
export class BadWordsEntity extends BaseEntity {
  @Column({ length: 20, comment: '敏感词' })
  word: string;

  @Column({ default: 1, comment: '敏感词开启状态' })
  status: number;

  @Column({ default: 0, comment: '敏感词触发次数' })
  count: number;
}
