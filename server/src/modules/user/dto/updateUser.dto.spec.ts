import { ValidationPipe } from '@nestjs/common';
import { UpdateUserDto } from './updateUser.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

// 与运行时相同的全局校验管道（main.ts）
const pipe = new ValidationPipe({ transform: true, whitelist: false });
const validate = (body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype: UpdateUserDto, data: '' });

describe('UpdateUserDto', () => {
  it('用户名最多 12 位，与数据库列宽、注册规则一致', async () => {
    await expect(validate({ username: '一二三四五六七八九十ab' })).resolves.toMatchObject({
      username: '一二三四五六七八九十ab',
    });
    await expect(validate({ username: 'abcdefghijklm' })).rejects.toMatchObject({
      response: { message: ['用户名不得超过12位！'] },
    });
  });
});
