type AnyFunction = (...args: any[]) => any;

export function createMockRepository(
  fn: () => AnyFunction,
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    findOne: fn(),
    find: fn(),
    save: fn(),
    update: fn(),
    count: fn(),
    create: fn(),
    createQueryBuilder: fn(),
    ...overrides,
  };
}

export function createMockQueryBuilder(
  options: {
    manyAndCount?: [any[], number];
    many?: any[];
    one?: any;
    rawOne?: any;
    rawMany?: any[];
    overrides?: Record<string, any>;
  } = {},
) {
  const conditions: any[] = [];
  const builder: any = {
    leftJoinAndSelect: () => builder,
    orderBy: () => builder,
    addOrderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    limit: () => builder,
    select: () => builder,
    addSelect: () => builder,
    groupBy: () => builder,
    addGroupBy: () => builder,
    setParameter: () => builder,
    where: (...args: any[]) => {
      conditions.push(args);
      return builder;
    },
    andWhere: (...args: any[]) => {
      conditions.push(args);
      return builder;
    },
    getManyAndCount: async () => options.manyAndCount || [[], 0],
    getMany: async () => options.many || [],
    getOne: async () => options.one || null,
    getRawOne: async () => options.rawOne || null,
    getRawMany: async () => options.rawMany || [],
    getConditions: () => conditions,
    ...(options.overrides || {}),
  };

  return builder;
}
