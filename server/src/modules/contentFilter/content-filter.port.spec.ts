import { CONTENT_FILTER_PORT, PassthroughContentFilter } from './content-filter.port';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('ContentFilterPort', () => {
  it('exposes a stable injection token', () => {
    expect(CONTENT_FILTER_PORT).toBe('CONTENT_FILTER_PORT');
  });

  it('passthrough filter never hits', async () => {
    const filter = new PassthroughContentFilter();

    await expect(filter.check()).resolves.toBeNull();
  });
});
