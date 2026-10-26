import { Logger } from '@nestjs/common';
import { GlobalConfigRegistry } from './global-config.registry';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('GlobalConfigRegistry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('merges front keys across sections and rejects duplicate section names', () => {
    const registry = new GlobalConfigRegistry();
    registry.register({ name: 'a', frontKeys: ['x', 'y'] });
    registry.register({ name: 'b', frontKeys: ['y', 'z'] });

    expect(registry.listSections()).toEqual(['a', 'b']);
    expect(registry.frontKeys()).toEqual(['x', 'y', 'z']);
    expect(() => registry.register({ name: 'a' })).toThrow('配置段 a 已注册');
  });

  it('runs every section validator and lets a validator normalize the value', async () => {
    const registry = new GlobalConfigRegistry();
    registry.register({
      name: 'trim',
      validate: item => {
        if (item.configKey === 'url') item.configVal = String(item.configVal).trim();
      },
    });
    registry.register({
      name: 'reject',
      validate: item => {
        if (item.configKey === 'flag' && !['0', '1'].includes(String(item.configVal))) {
          throw new Error('bad flag');
        }
      },
    });

    const item = { configKey: 'url', configVal: '  https://a.b  ' };
    await registry.validate(item);
    expect(item.configVal).toBe('https://a.b');
    await expect(registry.validate({ configKey: 'flag', configVal: '2' })).rejects.toThrow(
      'bad flag',
    );
  });

  it('isolates change-hook failures so other sections still run', async () => {
    const errorSpy = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    const registry = new GlobalConfigRegistry();
    const second = jest.fn();
    registry.register({
      name: 'broken',
      onChanged: () => {
        throw new Error('boom');
      },
    });
    registry.register({ name: 'ok', onChanged: second });

    await registry.notifyChanged(['siteName']);

    expect(second).toHaveBeenCalledWith(['siteName']);
    expect(errorSpy).toHaveBeenCalledWith(
      '配置段 broken 处理配置变更失败: boom',
      'GlobalConfigRegistry',
    );
  });
});
