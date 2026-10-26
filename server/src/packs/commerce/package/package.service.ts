import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Like, MoreThan, Repository } from 'typeorm';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { PackageBillingCycle, PackageEntity, PackagePlanType } from './package.entity';
import { OrderEntity } from '../order/order.entity';
import { CreatePackageDto } from './dto/createPackage.dto';
import type { UpdatePackageDto } from './dto/updatePackage.dto';
import { DeletePackageDto } from './dto/deletePackage.dto';
import { QueryAllPackageDto } from './dto/queryAllPackage.dto';

@Injectable()
export class PackageService {
  constructor(
    @InjectRepository(PackageEntity)
    private readonly packageEntity: Repository<PackageEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderEntity: Repository<OrderEntity>,
  ) {}

  private trimText(value: unknown, fallback = '') {
    if (value === undefined || value === null) return fallback;
    return String(value).trim();
  }

  private normalizeOptionalText(value: unknown) {
    const text = this.trimText(value);
    return text || null;
  }

  private formatPackageName(planName: string, variantName: string) {
    return [planName, variantName].filter(Boolean).join(' ').trim();
  }

  private calculateMembershipDays(billingCycle: PackageBillingCycle, billingCycleCount: number) {
    const daysByCycle: Partial<Record<PackageBillingCycle, number>> = {
      day: 1,
      week: 7,
      month: 30,
      year: 365,
    };
    const cycleDays = daysByCycle[billingCycle];
    return cycleDays ? cycleDays * billingCycleCount : 0;
  }

  private normalizePackagePayload(body: CreatePackageDto, existing?: PackageEntity) {
    const planKey = this.trimText(body.planKey || existing?.planKey);
    const planName = this.trimText(body.planName || existing?.planName);
    const variantName = this.trimText(body.variantName || existing?.variantName);
    const planType = (body.planType || existing?.planType || 'membership') as PackagePlanType;
    const billingCycle = (body.billingCycle ||
      existing?.billingCycle ||
      (planType === 'credit_pack' ? 'one_time' : 'month')) as PackageBillingCycle;
    const billingCycleCount = Number(body.billingCycleCount || existing?.billingCycleCount || 1);
    let days = 0;
    const credits = Number(body.credits ?? existing?.credits ?? 0);
    const price = Number(body.price ?? existing?.price ?? 0);
    const weight = Number(body.weight ?? existing?.weight ?? 0);
    const status = Number(body.status ?? existing?.status ?? 1);

    if (!planKey || !/^[a-zA-Z0-9_-]{2,64}$/.test(planKey)) {
      throw new HttpException('方案标识格式错误', HttpStatus.BAD_REQUEST);
    }
    if (!planName) {
      throw new HttpException('方案名称不能为空', HttpStatus.BAD_REQUEST);
    }
    if (!variantName) {
      throw new HttpException('规格名称不能为空', HttpStatus.BAD_REQUEST);
    }
    if (planType === 'membership') {
      if (billingCycle === 'one_time') {
        throw new HttpException('周期会员不能使用一次性周期', HttpStatus.BAD_REQUEST);
      }
      days = this.calculateMembershipDays(billingCycle, billingCycleCount);
      if (days <= 0) {
        throw new HttpException('周期会员周期配置无效', HttpStatus.BAD_REQUEST);
      }
    }
    if (planType === 'credit_pack') {
      if (billingCycle !== 'one_time') {
        throw new HttpException('积分包必须使用一次性周期', HttpStatus.BAD_REQUEST);
      }
      days = 0;
      if (credits <= 0) {
        throw new HttpException('积分包积分额度必须大于 0', HttpStatus.BAD_REQUEST);
      }
    }

    if (status === 1 && price <= 0) {
      throw new HttpException('已启用套餐价格必须大于 0', HttpStatus.BAD_REQUEST);
    }

    const priceUsd =
      (body.priceUsd as any) === '' || body.priceUsd === undefined || body.priceUsd === null
        ? null
        : Number(body.priceUsd);

    return {
      name: this.trimText(body.name) || this.formatPackageName(planName, variantName),
      des: this.trimText(body.des),
      planKey,
      planName,
      planDescription: this.normalizeOptionalText(body.planDescription),
      planIcon: this.trimText(body.planIcon),
      planType,
      featureText: this.normalizeOptionalText(body.featureText),
      variantName,
      billingCycle,
      billingCycleCount,
      variantOrder: Number(body.variantOrder ?? existing?.variantOrder ?? 100),
      isDefaultVariant:
        Number(body.isDefaultVariant ?? existing?.isDefaultVariant ?? 0) === 1 ? 1 : 0,
      badgeText: this.trimText(body.badgeText),
      price,
      priceUsd,
      order: Number(body.order ?? existing?.order ?? 100),
      status,
      weight,
      days,
      credits,
    };
  }

  private async unsetOtherDefaultVariants(
    planKey: string,
    planType: PackagePlanType,
    excludeId?: number,
  ) {
    await this.packageEntity
      .createQueryBuilder()
      .update(PackageEntity)
      .set({ isDefaultVariant: 0 })
      .where('planKey = :planKey', { planKey })
      .andWhere('planType = :planType', { planType })
      .andWhere(excludeId ? 'id != :id' : '1=1', { id: excludeId })
      .execute();
  }

  private splitFeatureText(featureText?: string | null) {
    return String(featureText || '')
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  /* 查询所有套餐 */
  async queryAllPackage(query: QueryAllPackageDto) {
    try {
      const { page = 1, size = 10, name, status, type, planKey, planType, billingCycle } = query;
      const currentPage = Math.max(Number(page) || 1, 1);
      const pageSize = Math.min(Math.max(Number(size) || 10, 1), 100);
      const baseWhere = {};
      planKey && Object.assign(baseWhere, { planKey });
      planType && Object.assign(baseWhere, { planType });
      billingCycle && Object.assign(baseWhere, { billingCycle });
      Object.assign(baseWhere, {
        status: status === undefined || status === null ? 1 : status,
      });
      if (type !== undefined && type !== null) {
        if (type > 0) {
          Object.assign(baseWhere, { days: MoreThan(0) });
        } else {
          Object.assign(baseWhere, { days: LessThanOrEqual(0) });
        }
      }
      const where = name
        ? [
            { ...baseWhere, name: Like(`%${name}%`) },
            { ...baseWhere, planName: Like(`%${name}%`) },
            { ...baseWhere, variantName: Like(`%${name}%`) },
          ]
        : baseWhere;
      const [rows, count] = await this.packageEntity.findAndCount({
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
        where,
        order: { order: 'DESC' },
        select: {
          id: true,
          name: true,
          des: true,
          planKey: true,
          planName: true,
          planDescription: true,
          planIcon: true,
          planType: true,
          featureText: true,
          variantName: true,
          billingCycle: true,
          billingCycleCount: true,
          variantOrder: true,
          isDefaultVariant: true,
          badgeText: true,
          price: true,
          priceUsd: true,
          order: true,
          status: true,
          weight: true,
          days: true,
          credits: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return { rows, count };
    } catch (error) {
      Logger.error(`查询套餐列表失败: ${error.message}`, getErrorStack(error), 'PackageService');
    }
  }

  async queryPlans(query: QueryAllPackageDto) {
    const { planType } = query;
    const where: Record<string, any> = { status: 1 };
    if (planType) {
      where.planType = planType;
    }

    const rows = await this.packageEntity.find({
      where,
      order: {
        planType: 'ASC',
        order: 'DESC',
        planKey: 'ASC',
        variantOrder: 'ASC',
        id: 'ASC',
      },
    });

    const planMap = new Map<string, any>();
    for (const item of rows) {
      const key = `${item.planType}:${item.planKey}`;
      if (!planMap.has(key)) {
        planMap.set(key, {
          planKey: item.planKey,
          planName: item.planName,
          planDescription: item.planDescription || '',
          planIcon: item.planIcon || '',
          planType: item.planType,
          order: item.order,
          featureText: item.featureText || '',
          features: this.splitFeatureText(item.featureText),
          defaultVariantId: null,
          variants: [],
        });
      }

      const plan = planMap.get(key);
      if (!plan.featureText && item.featureText) {
        plan.featureText = item.featureText;
        plan.features = this.splitFeatureText(item.featureText);
      }
      const variant = {
        id: item.id,
        name: item.name,
        variantName: item.variantName,
        billingCycle: item.billingCycle,
        billingCycleCount: item.billingCycleCount,
        variantOrder: item.variantOrder,
        isDefaultVariant: item.isDefaultVariant,
        badgeText: item.badgeText || '',
        price: item.price,
        priceUsd: item.priceUsd,
        days: item.days,
        credits: item.credits,
        weight: item.weight,
      };
      plan.variants.push(variant);
      if (item.isDefaultVariant === 1 || !plan.defaultVariantId) {
        plan.defaultVariantId =
          item.isDefaultVariant === 1 ? item.id : plan.defaultVariantId || item.id;
      }
    }

    return { rows: Array.from(planMap.values()), count: planMap.size };
  }

  /* 创建套餐 */
  async createPackage(body: CreatePackageDto) {
    const payload = this.normalizePackagePayload(body);
    try {
      if (payload.isDefaultVariant === 1) {
        await this.unsetOtherDefaultVariants(payload.planKey, payload.planType);
      }
      return await this.packageEntity.save(payload);
    } catch (error) {
      Logger.error(`创建套餐失败: ${error.message}`, getErrorStack(error), 'PackageService');
      throw new HttpException(error, HttpStatus.BAD_REQUEST);
    }
  }

  /* 更新套餐 */
  async updatePackage(body: UpdatePackageDto) {
    const { id } = body;
    const op = await this.packageEntity.findOne({ where: { id } });
    if (!op) {
      throw new HttpException('当前套餐不存在、请检查你的输入参数！', HttpStatus.BAD_REQUEST);
    }
    const payload = this.normalizePackagePayload(body, op);
    if (payload.isDefaultVariant === 1) {
      await this.unsetOtherDefaultVariants(payload.planKey, payload.planType, id);
    }

    const res = await this.packageEntity.update({ id }, payload);
    if ((res.affected ?? 0) > 0) {
      return '更新套餐成功！';
    } else {
      throw new HttpException('更新套餐失败、请重试！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 删除套餐 */
  async delPackage(body: DeletePackageDto) {
    const { id } = body;
    const orderCount = await this.orderEntity.count({ where: { goodsId: id } });
    if (orderCount > 0) {
      throw new HttpException(
        '当前套餐存在关联订单，无法删除。如需停用请将状态设为禁用。',
        HttpStatus.BAD_REQUEST,
      );
    }
    return await this.packageEntity.delete({ id });
  }
}
