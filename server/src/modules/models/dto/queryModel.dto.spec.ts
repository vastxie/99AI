import { ValidationPipe } from '@nestjs/common';
import { QueryModelDto } from './queryModel.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

const pipe = new ValidationPipe({ transform: true, whitelist: false });

describe('QueryModelDto', () => {
  it('不设每页上限，管理端一次拉取全部模型的请求仍然通过；页码仍须为正整数', async () => {
    await expect(
      pipe.transform(
        { page: '1', size: '1000', status: '' },
        { type: 'query', metatype: QueryModelDto, data: '' },
      ),
    ).resolves.toMatchObject({ page: 1, size: 1000 });
    await expect(
      pipe.transform({ page: '0' }, { type: 'query', metatype: QueryModelDto, data: '' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
