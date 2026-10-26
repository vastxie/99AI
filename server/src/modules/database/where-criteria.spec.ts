import {
  Column,
  DataSource,
  DeleteDateColumn,
  DeleteQueryBuilder,
  Entity,
  In,
  IsNull,
  ManyToOne,
  PrimaryGeneratedColumn,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from 'typeorm';
import { SoftDeleteQueryBuilder } from 'typeorm/query-builder/SoftDeleteQueryBuilder';
import { INVALID_WHERE_VALUES_BEHAVIOR } from './database-schema';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;
declare const beforeAll: any;
declare const afterEach: any;

@Entity('where_owner')
class WhereOwner {
  @PrimaryGeneratedColumn()
  id: number;
}

@Entity('where_item')
class WhereItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ownerId: number;

  @Column({ type: 'varchar', nullable: true })
  value: string | null;

  @Column({ default: 0 })
  counter: number;

  @ManyToOne(() => WhereOwner)
  owner: WhereOwner;

  @DeleteDateColumn()
  deletedAt?: Date;
}

/** 1.x 的类型已拒绝字面量 null；运行时的空值来自未校验参数，这里用宽类型模拟 */
const runtime = (criteria: unknown): any => criteria;
/** 按文案判定：未连库时真的去执行也会抛出 TypeORM 的连接错误，只看错误类型会误判为通过 */
const NULLISH_VALUE = /(Undefined|Null) value encountered/;
const EMPTY_CRITERIA = /Empty criteria\(s\) are not allowed/;

describe('where criteria with null / undefined values', () => {
  let source: DataSource;
  const executed: string[] = [];

  beforeAll(async () => {
    source = new DataSource({
      type: 'mysql',
      database: 'offline_where',
      entities: [WhereOwner, WhereItem],
      invalidWhereValuesBehavior: INVALID_WHERE_VALUES_BEHAVIOR,
    });
    await (source as any).buildMetadatas();
  });

  /** 不连数据库：拦下执行，只记录生成的 SQL */
  const captureQueries = () => {
    for (const builder of [UpdateQueryBuilder, DeleteQueryBuilder, SoftDeleteQueryBuilder]) {
      jest.spyOn(builder.prototype, 'execute').mockImplementation(function (this: any) {
        executed.push(this.getQuery());
        return Promise.resolve({ raw: [], affected: 0, generatedMaps: [] });
      });
    }
    jest.spyOn(SelectQueryBuilder.prototype, 'getRawAndEntities').mockImplementation(function (
      this: any,
    ) {
      executed.push(this.getQuery());
      return Promise.resolve({ raw: [], entities: [] });
    });
    jest.spyOn(SelectQueryBuilder.prototype, 'getCount').mockImplementation(function (this: any) {
      executed.push(this.getQuery());
      return Promise.resolve(0);
    });
    jest.spyOn(SelectQueryBuilder.prototype, 'getExists').mockImplementation(function (this: any) {
      executed.push(this.getQuery());
      return Promise.resolve(false);
    });
  };

  afterEach(() => {
    executed.length = 0;
    jest.restoreAllMocks();
  });

  it('rejects reads whose conditions hold null or undefined before any SQL runs', async () => {
    captureQueries();
    const repository = source.getRepository(WhereItem);

    // 忽略空值时，这些查询会去掉对应条件，命中任意一行或全部行
    await expect(repository.findOne({ where: { id: undefined } })).rejects.toThrow(NULLISH_VALUE);
    await expect(repository.findOneBy(runtime({ ownerId: null }))).rejects.toThrow(NULLISH_VALUE);
    await expect(
      repository.find({ where: [{ ownerId: 1 }, { ownerId: undefined }] }),
    ).rejects.toThrow(NULLISH_VALUE);
    await expect(repository.count({ where: { owner: { id: undefined } } })).rejects.toThrow(
      NULLISH_VALUE,
    );
    await expect(repository.findAndCount({ where: runtime({ value: null }) })).rejects.toThrow(
      NULLISH_VALUE,
    );
    await expect(repository.exists({ where: { ownerId: undefined } })).rejects.toThrow(
      NULLISH_VALUE,
    );
    await expect(
      source.manager.findOne(WhereItem, { where: { ownerId: 7, value: undefined } }),
    ).rejects.toThrow(NULLISH_VALUE);
    expect(executed).toEqual([]);
  });

  it('rejects writes whose criteria hold null or undefined before any SQL runs', async () => {
    captureQueries();
    const repository = source.getRepository(WhereItem);

    await expect(
      repository.update(runtime({ ownerId: 7, value: null }), { value: 'x' }),
    ).rejects.toThrow(NULLISH_VALUE);
    await expect(repository.delete({ ownerId: undefined, value: 'a' })).rejects.toThrow(
      NULLISH_VALUE,
    );
    await expect(repository.softDelete([{ ownerId: 1 }, { ownerId: undefined }])).rejects.toThrow(
      NULLISH_VALUE,
    );
    await expect(repository.restore({ owner: { id: undefined } })).rejects.toThrow(NULLISH_VALUE);
    await expect(repository.increment({ ownerId: undefined }, 'counter', 1)).rejects.toThrow(
      NULLISH_VALUE,
    );
    await expect(
      source
        .createQueryRunner()
        .manager.decrement(WhereItem, runtime({ ownerId: null }), 'counter', 1),
    ).rejects.toThrow(NULLISH_VALUE);
    // 条件整体为空同样拒绝，不会渲染成恒真的 WHERE
    await expect(repository.update({}, { value: 'x' })).rejects.toThrow(EMPTY_CRITERIA);
    await expect(repository.delete([])).rejects.toThrow(EMPTY_CRITERIA);
    expect(executed).toEqual([]);
  });

  it('keeps every predicate of well-formed criteria', async () => {
    captureQueries();
    const repository = source.getRepository(WhereItem);

    await repository.find({ where: { ownerId: 7, value: IsNull() } });
    await repository.count({ where: [{ ownerId: 1 }, { id: In([2, 3]) }] });
    await repository.exists({ where: { ownerId: 7 } });
    await repository.update({ ownerId: 7, value: IsNull() }, { value: 'x' });
    await repository.delete([{ ownerId: 1 }, { ownerId: 2, value: 'a' }]);
    await repository.increment({ ownerId: 7 }, 'counter', 1);

    expect(executed[0]).toContain(
      'WHERE ( ((`WhereItem`.`ownerId` = :orm_param_0) AND (`WhereItem`.`value` IS NULL)) )',
    );
    expect(executed[1]).toContain(
      'WHERE ( ((((`WhereItem`.`ownerId` = :orm_param_0))) OR (((`WhereItem`.`id` IN (:orm_param_1, :orm_param_2))))) )',
    );
    expect(executed[2]).toContain('WHERE ( ((`WhereItem`.`ownerId` = :orm_param_0)) )');
    expect(executed[3]).toBe(
      'UPDATE `where_item` SET `value` = :orm_param_1 WHERE (`ownerId` = :orm_param_0 AND `value` IS NULL)',
    );
    expect(executed[4]).toBe(
      'DELETE FROM `where_item` WHERE (`ownerId` = :orm_param_0 OR (`ownerId` = :orm_param_1 AND `value` = :orm_param_2))',
    );
    expect(executed[5]).toBe(
      'UPDATE `where_item` SET `counter` = `counter` + 1 WHERE `ownerId` = :orm_param_0',
    );
  });
});
