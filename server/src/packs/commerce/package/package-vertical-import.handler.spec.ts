import { VerticalImportRegistry } from '@/modules/vertical/vertical-import.registry';
import { PackageVerticalImportHandler } from './package-vertical-import.handler';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function build() {
  const packageService = {
    createPackage: jest.fn().mockResolvedValue({}),
    updatePackage: jest.fn().mockResolvedValue({}),
  };
  const repository = { findOne: jest.fn() };
  const registry = new VerticalImportRegistry();
  const handler = new PackageVerticalImportHandler(
    packageService as any,
    repository as any,
    registry,
  );
  return { packageService, repository, registry, handler };
}

describe('PackageVerticalImportHandler', () => {
  it('registers the packages section and upserts presets by planKey + variantName', async () => {
    const { packageService, repository, registry, handler } = build();
    expect(registry.get('packages')).toBe(handler);
    repository.findOne.mockResolvedValueOnce({ id: 9 }).mockResolvedValueOnce(null);

    const result = await handler.apply(
      [
        { planKey: 'pro', planName: 'Pro', variantName: 'month', price: 29, credits: 3000 },
        { planKey: 'pro', planName: 'Pro', variantName: 'year', price: 299, credits: 40000 },
        { planName: 'broken' },
      ],
      { manifest: {} as any, manifestDir: '/tmp', dryRun: false },
    );

    expect(packageService.updatePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        planKey: 'pro',
        variantName: 'month',
        planType: 'membership',
        status: 1,
      }),
    );
    expect(packageService.createPackage).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: 'pro', variantName: 'year', billingCycle: 'month' }),
    );
    expect(result.applied).toEqual(['套餐 pro / month（已更新）', '套餐 pro / year（已新建）']);
    expect(result.skipped).toHaveLength(1);
  });

  it('only plans in dry-run mode and rejects non-array payloads', async () => {
    const { packageService, repository, handler } = build();
    repository.findOne.mockResolvedValue(null);
    const result = await handler.apply(
      [{ planKey: 'a', planName: 'A', variantName: 'v', price: 1, credits: 1 }],
      {
        manifest: {} as any,
        manifestDir: '/tmp',
        dryRun: true,
      },
    );
    expect(result.applied).toEqual(['套餐 a / v（将新建）']);
    expect(packageService.createPackage).not.toHaveBeenCalled();
    await expect(
      handler.apply({}, { manifest: {} as any, manifestDir: '/tmp', dryRun: true }),
    ).rejects.toThrow('extensions.packages 必须是数组');
  });
});
