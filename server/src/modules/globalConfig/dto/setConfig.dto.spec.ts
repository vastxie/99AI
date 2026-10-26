import { ValidationPipe } from '@nestjs/common';
import { CONFIG_VALUE_MAX_BYTES, SetConfigDto } from './setConfig.dto';

declare const describe: any;
declare const it: any;
declare const expect: any;

// 与 main.ts 的全局管道一致
const pipe = new ValidationPipe({ transform: true, whitelist: false });
const body = (settings: unknown) =>
  pipe.transform({ settings }, { type: 'body', metatype: SetConfigDto, data: '' });

describe('SetConfigDto', () => {
  it('stores strings and converts numbers and booleans to strings', async () => {
    await expect(
      body([
        { configKey: 'siteName', configVal: '99Agent' },
        { configKey: 'maxToolCalls', configVal: 25 },
        { configKey: 'signInStatus', configVal: true },
        { configKey: 'noticeInfo', configVal: '' },
      ]),
    ).resolves.toMatchObject({
      settings: [
        { configVal: '99Agent' },
        { configVal: '25' },
        { configVal: 'true' },
        { configVal: '' },
      ],
    });
  });

  it.each([
    [{ nested: 'object' }],
    [['array']],
    [null],
    [undefined],
    ['字'.repeat(Math.floor(CONFIG_VALUE_MAX_BYTES / 3) + 1)],
  ])('rejects %p', async (configVal: unknown) => {
    await expect(body([{ configKey: 'siteName', configVal }])).rejects.toMatchObject({
      status: 400,
    });
  });
});
