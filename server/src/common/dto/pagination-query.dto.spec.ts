import { ValidationPipe } from '@nestjs/common';
import { PAGINATION_MAX_SIZE, PaginationQueryDto } from './pagination-query.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

/** 与 main.ts 全局管道相同的配置：transform 开、whitelist 关 */
const pipe = new ValidationPipe({ transform: true, whitelist: false });
/** 个别控制器（如套餐查询）局部启用 whitelist：未声明字段剥掉，分页字段必须保留 */
const whitelistPipe = new ValidationPipe({ transform: true, whitelist: true });

function transformQuery(metatype: any, value: Record<string, unknown>, activePipe = pipe) {
  return activePipe.transform(value, { type: 'query', metatype, data: '' });
}

describe('PaginationQueryDto', () => {
  it('page / size 可省略，空串视为未提供，查询串数字转成整数', async () => {
    await expect(transformQuery(PaginationQueryDto, {})).resolves.toEqual({});
    // 表单把空筛选项序列化成 '' 时视为未提供，沿用订单查询 DTO 原有的宽容度
    await expect(transformQuery(PaginationQueryDto, { page: '', size: '' })).resolves.toEqual({});
    await expect(transformQuery(PaginationQueryDto, { page: '2', size: '20' })).resolves.toEqual({
      page: 2,
      size: 20,
    });
    await expect(
      transformQuery(PaginationQueryDto, { size: String(PAGINATION_MAX_SIZE) }),
    ).resolves.toEqual({ size: PAGINATION_MAX_SIZE });
  });

  it('拒绝非整数、小于 1 或超过上限的分页参数', async () => {
    for (const value of [{ page: '0' }, { page: 'abc' }, { size: '1.5' }, { size: '101' }]) {
      await expect(transformQuery(PaginationQueryDto, value)).rejects.toMatchObject({
        status: 400,
      });
    }
  });

  it('whitelist 管道下分页字段保留、未声明字段剥掉', async () => {
    await expect(
      transformQuery(PaginationQueryDto, { page: '2', size: '50', junk: '1' }, whitelistPipe),
    ).resolves.toEqual({ page: 2, size: 50 });
  });
});
