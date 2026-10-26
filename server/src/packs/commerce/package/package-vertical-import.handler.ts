import type { VerticalPackagePreset } from '@99agent/contracts';
import {
  VerticalImportRegistry,
  type VerticalImportContext,
  type VerticalImportHandler,
  type VerticalImportSectionResult,
} from '@/modules/vertical/vertical-import.registry';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UpdatePackageDto } from './dto/updatePackage.dto';
import { PackageEntity } from './package.entity';
import { PackageService } from './package.service';

/** 垂直包清单 extensions.packages：按 planKey + variantName 新建或更新套餐（商业包） */
@Injectable()
export class PackageVerticalImportHandler implements VerticalImportHandler {
  readonly section = 'packages';

  constructor(
    private readonly packageService: PackageService,
    @InjectRepository(PackageEntity)
    private readonly packageRepository: Repository<PackageEntity>,
    registry: VerticalImportRegistry,
  ) {
    registry.register(this);
  }

  async apply(
    payload: unknown,
    context: VerticalImportContext,
  ): Promise<VerticalImportSectionResult> {
    const result: VerticalImportSectionResult = { applied: [], skipped: [], manual: [] };
    if (!Array.isArray(payload)) {
      throw new Error('extensions.packages 必须是数组');
    }
    for (const entry of payload as VerticalPackagePreset[]) {
      if (!entry || typeof entry !== 'object' || !entry.planKey || !entry.variantName) {
        result.skipped.push('套餐预设缺少 planKey / variantName，已跳过');
        continue;
      }
      const dto = {
        planType: 'membership',
        billingCycle: 'month',
        billingCycleCount: 1,
        status: 1,
        weight: 0,
        order: 0,
        ...entry,
      };
      const label = `套餐 ${entry.planKey} / ${entry.variantName}`;
      const existing = await this.packageRepository.findOne({
        where: { planKey: entry.planKey, variantName: entry.variantName },
      });
      if (context.dryRun) {
        result.applied.push(`${label}（${existing ? '将更新' : '将新建'}）`);
        continue;
      }
      if (existing) {
        await this.packageService.updatePackage({ ...dto, id: existing.id } as UpdatePackageDto);
        result.applied.push(`${label}（已更新）`);
      } else {
        await this.packageService.createPackage(dto as any);
        result.applied.push(`${label}（已新建）`);
      }
    }
    return result;
  }
}
