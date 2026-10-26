import { HttpException } from '@nestjs/common';
import { createPackage } from '../test/order.factory';
import { PackageService } from './package.service';
import type { PackageEntity } from './package.entity';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('PackageService plan and variant productization', () => {
  let packageRepository: any;
  let orderRepository: any;
  let service: PackageService;

  function mockUpdateBuilder() {
    const builder: any = {
      update: jest.fn(() => builder),
      set: jest.fn(() => builder),
      where: jest.fn(() => builder),
      andWhere: jest.fn(() => builder),
      execute: jest.fn(async () => ({ affected: 1 })),
    };
    return builder;
  }

  beforeEach(() => {
    packageRepository = {
      find: jest.fn(),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (payload: Partial<PackageEntity>) => ({ id: 1, ...payload })),
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(mockUpdateBuilder),
    };
    orderRepository = {
      count: jest.fn(async () => 0),
    };
    service = new PackageService(packageRepository, orderRepository);
  });

  it('groups enabled variants into user-facing plans and uses featureText as the only benefits source', async () => {
    packageRepository.find.mockResolvedValue([
      createPackage({
        id: 1,
        name: 'Pro 月付',
        planKey: 'pro',
        planName: '专业版',
        planDescription: '高级能力',
        planType: 'membership',
        variantName: '月付',
        billingCycle: 'month',
        billingCycleCount: 1,
        variantOrder: 1,
        isDefaultVariant: 1,
        featureText: '权益 A\n权益 B',
        des: '后台备注不作为权益',
      }),
      createPackage({
        id: 2,
        name: 'Pro 年付',
        planKey: 'pro',
        planName: '专业版',
        planType: 'membership',
        variantName: '年付',
        billingCycle: 'year',
        billingCycleCount: 1,
        variantOrder: 2,
        isDefaultVariant: 0,
        featureText: '权益 A\n权益 B',
      }),
    ]);

    const result = await service.queryPlans({ planType: 'membership' } as any);

    expect(packageRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 1, planType: 'membership' } }),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        planKey: 'pro',
        planName: '专业版',
        defaultVariantId: 1,
        features: ['权益 A', '权益 B'],
      }),
    );
    expect(JSON.stringify(result.rows[0])).not.toContain('后台备注不作为权益');
    expect(result.rows[0].variants).toHaveLength(2);
  });

  it('unsets sibling default variants when creating a new default variant', async () => {
    const builder = mockUpdateBuilder();
    packageRepository.createQueryBuilder.mockReturnValue(builder);

    await service.createPackage({
      planKey: 'pro',
      planName: '专业版',
      planType: 'membership',
      variantName: '月付',
      billingCycle: 'month',
      billingCycleCount: 1,
      isDefaultVariant: 1,
      price: 99,
      weight: 2,
      status: 1,
      credits: 100,
    } as any);

    expect(builder.set).toHaveBeenCalledWith({ isDefaultVariant: 0 });
    expect(packageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '专业版 月付',
        planType: 'membership',
        billingCycle: 'month',
        days: 30,
        isDefaultVariant: 1,
      }),
    );
  });

  it('derives membership effective days from billing cycle and count', async () => {
    await service.createPackage({
      planKey: 'pro',
      planName: '专业版',
      planType: 'membership',
      variantName: '季度',
      billingCycle: 'month',
      billingCycleCount: 3,
      price: 199,
      weight: 2,
      status: 1,
      credits: 100,
    } as any);

    expect(packageRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        billingCycle: 'month',
        billingCycleCount: 3,
        days: 90,
      }),
    );
  });

  it('rejects invalid billing-cycle combinations', async () => {
    await expect(
      service.createPackage({
        planKey: 'points',
        planName: '积分包',
        planType: 'credit_pack',
        variantName: '1000 积分',
        billingCycle: 'month',
        billingCycleCount: 1,
        price: 99,
        weight: 0,
        status: 1,
        days: 0,
        credits: 1000,
      } as any),
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      service.createPackage({
        planKey: 'pro',
        planName: '专业版',
        planType: 'membership',
        variantName: '一次性',
        billingCycle: 'one_time',
        billingCycleCount: 1,
        price: 99,
        weight: 2,
        status: 1,
        days: 30,
        credits: 100,
      } as any),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects enabled zero-price packages and empty credit packs', async () => {
    await expect(
      service.createPackage({
        planKey: 'trial',
        planName: '体验版',
        planType: 'membership',
        variantName: '月付',
        billingCycle: 'month',
        billingCycleCount: 1,
        price: 0,
        weight: 1,
        status: 1,
        credits: 10,
      } as any),
    ).rejects.toBeInstanceOf(HttpException);

    await expect(
      service.createPackage({
        planKey: 'points',
        planName: '积分',
        planType: 'credit_pack',
        variantName: '空积分包',
        billingCycle: 'one_time',
        billingCycleCount: 1,
        price: 9,
        weight: 0,
        status: 1,
        credits: 0,
      } as any),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
