import { ValidationPipe } from '@nestjs/common';
import { QueryAllUserDto } from './queryAllUser.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

const pipe = new ValidationPipe({ transform: true, whitelist: false });

describe('QueryAllUserDto', () => {
  it('继承分页校验，其余过滤字段原样透传', async () => {
    await expect(
      pipe.transform(
        { page: '1', size: '20', username: '', status: '' },
        { type: 'query', metatype: QueryAllUserDto, data: '' },
      ),
    ).resolves.toMatchObject({ page: 1, size: 20, username: '', status: '' });
    await expect(
      pipe.transform({ size: '101' }, { type: 'query', metatype: QueryAllUserDto, data: '' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
