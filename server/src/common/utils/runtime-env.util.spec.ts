import { describeRuntimeEnvironmentWarning, isDevelopmentRuntime } from './runtime-env.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('runtime-env.util', () => {
  it('treats an unset environment as production', () => {
    expect(isDevelopmentRuntime({})).toBe(false);
    expect(describeRuntimeEnvironmentWarning({})).toContain('NODE_ENV=production');
  });

  it('only relaxes when development or test is declared explicitly', () => {
    expect(isDevelopmentRuntime({ NODE_ENV: 'development' })).toBe(true);
    expect(isDevelopmentRuntime({ NODE_ENV: 'test' })).toBe(true);
    expect(isDevelopmentRuntime({ ISDEV: 'true' })).toBe(true);
    expect(isDevelopmentRuntime({ NODE_ENV: 'staging' })).toBe(false);
  });

  it('lets an explicit production marker win over development flags', () => {
    expect(isDevelopmentRuntime({ NODE_ENV: 'production', ISDEV: 'true' })).toBe(false);
    expect(isDevelopmentRuntime({ NODE_ENV: 'development', ISDEV: 'false' })).toBe(false);
    expect(describeRuntimeEnvironmentWarning({ NODE_ENV: 'production' })).toBeNull();
  });
});
