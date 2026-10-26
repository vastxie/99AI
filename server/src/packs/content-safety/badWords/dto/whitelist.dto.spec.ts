import { ValidationPipe } from '@nestjs/common';
import { UpdateWhitelistDto, WhitelistIdDto } from './whitelist.dto';

declare const describe: any;
declare const it: any;
declare const expect: any;

// 与 main.ts 的全局管道一致
const pipe = new ValidationPipe({ transform: true, whitelist: false });
const body = (metatype: any, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype, data: '' });

describe('whitelist DTOs', () => {
  it.each([{}, { id: null }, { id: 0 }, { id: 'abc' }, { id: 1.5 }])(
    'rejects %j before any lookup or write',
    async (value: unknown) => {
      await expect(body(WhitelistIdDto, value)).rejects.toMatchObject({ status: 400 });
      await expect(body(UpdateWhitelistDto, value)).rejects.toMatchObject({ status: 400 });
    },
  );

  it('accepts numeric ids and optional fields', async () => {
    await expect(body(WhitelistIdDto, { id: '3' })).resolves.toMatchObject({ id: 3 });
    await expect(
      body(UpdateWhitelistDto, { id: 3, word: '示例', remark: '' }),
    ).resolves.toMatchObject({ id: 3, word: '示例', remark: '' });
    await expect(body(UpdateWhitelistDto, { id: 3, word: 'x'.repeat(256) })).rejects.toMatchObject({
      status: 400,
    });
  });
});
