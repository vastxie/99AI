import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CramiEntity } from './crami.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, MoreThan, LessThanOrEqual, Not } from 'typeorm';
import { CramiPackageEntity } from './cramiPackage.entity';
import { CreatePackageDto } from './dto/createPackage.dto';
import { CreatCramiDto } from './dto/createCrami.dto';
import { generateCramiCode, isExpired, maskCrami, maskEmail } from '@/common/utils';
import { Request } from 'express';
import { UseCramiDto } from './dto/useCrami.dto';
import { UserEntity } from '../user/user.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { RechargeType } from '@/common/constants/balance.constant';
import { QuerAllPackageDto } from './dto/queryAllPackage.dto';
import { DeletePackageDto } from './dto/deletePackage.dto';
import { QuerAllCramiDto } from './dto/queryAllCrami.dto';
import { BatchDelCramiDto } from './dto/batchDelCrami.dto';

@Injectable()
export class CramiService {
  constructor(
    @InjectRepository(CramiEntity)
    private readonly cramiEntity: Repository<CramiEntity>,
    @InjectRepository(CramiPackageEntity)
    private readonly cramiPackageEntity: Repository<CramiPackageEntity>,
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly userBalanceService: UserBalanceService,
  ) {}

  /* 查询单个套餐 */
  async queryOnePackage(id) {
    return await this.cramiPackageEntity.findOne({ where: { id } });
  }

  /* 查询所有套餐 */
  async queryAllPackage(query: QuerAllPackageDto) {
    try {
      const { page = 1, size = 10, name, status, type } = query;
      const where = {};
      name && Object.assign(where, { name: Like(`%${name}%`) });
      status && Object.assign(where, { status });
      if (type) {
        if (type > 0) {
          Object.assign(where, { days: MoreThan(0) });
        } else {
          Object.assign(where, { days: LessThanOrEqual(0) });
        }
      }
      const [rows, count] = await this.cramiPackageEntity.findAndCount({
        skip: (page - 1) * size,
        take: size,
        where,
        order: { order: 'DESC' },
      });
      return { rows, count };
    } catch (error) {
      console.log('error: ', error);
    }
  }

  /* 创建套餐 */
  async createPackage(body: CreatePackageDto) {
    const { name, weight } = body;
    const p = await this.cramiPackageEntity.findOne({ where: [{ name }, { weight }] });
    if (p) {
      throw new HttpException('套餐名称或套餐等级重复、请检查！', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.cramiPackageEntity.save(body);
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException(error, HttpStatus.BAD_REQUEST);
    }
  }

  /* 更新套餐 E */
  async updatePackage(body) {
    const { id, name, weight } = body;
    const op = await this.cramiPackageEntity.findOne({ where: { id } });
    if (!op) {
      throw new HttpException('当前套餐不存在、请检查你的输入参数！', HttpStatus.BAD_REQUEST);
    }
    const count = await this.cramiPackageEntity.count({
      where: [
        { name, id: Not(id) },
        { weight, id: Not(id) },
      ],
    });
    if (count) {
      throw new HttpException('套餐名称或套餐等级重复、请检查！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.cramiPackageEntity.update({ id }, body);
    if (res.affected > 0) {
      return '更新套餐成功！';
    } else {
      throw new HttpException('更新套餐失败、请重试！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 删除套餐 */
  async delPackage(body: DeletePackageDto) {
    const { id } = body;
    const count = await this.cramiEntity.count({ where: { packageId: id } });
    if (count) {
      throw new HttpException('当前套餐下存在卡密、请先删除卡密后才可删除套餐！', HttpStatus.BAD_REQUEST);
    }
    return await this.cramiPackageEntity.delete({ id });
  }

  /* 生成卡密 */
  async createCrami(body: CreatCramiDto) {
    const { packageId, count = 1 } = body;
    /* 创建有套餐的卡密 */
    if (packageId) {
      const pkg = await this.cramiPackageEntity.findOne({ where: { id: packageId } });
      if (!pkg) {
        throw new HttpException('当前套餐不存在、请确认您选择的套餐是否存在！', HttpStatus.BAD_REQUEST);
      }
      const { days = -1, model3Count = 0, model4Count = 0, drawMjCount = 0 } = pkg;
      const baseCrami = { packageId, days, model3Count, model4Count, drawMjCount };
      return await this.generateCrami(baseCrami, count);
    }
    /* 创建自定义的卡密 */
    if (!packageId) {
      const { model3Count = 0, model4Count = 0, drawMjCount = 0 } = body;
      if ([model3Count, model4Count, drawMjCount].every((v) => !v)) {
        throw new HttpException('自定义卡密必须至少一项余额不为0️零！', HttpStatus.BAD_REQUEST);
      }
      const baseCrami = { days: -1, model3Count, model4Count, drawMjCount };
      return await this.generateCrami(baseCrami, count);
    }
  }

  /* 创建卡密 */
  async generateCrami(cramiInfo, count: number) {
    const cramiList = [];
    for (let i = 0; i < count; i++) {
      const code = generateCramiCode();
      const crami = this.cramiEntity.create({ ...cramiInfo, code });
      cramiList.push(crami);
    }
    return await this.cramiEntity.save(cramiList);
  }

  /* 使用卡密 */
  async useCrami(req: Request, body: UseCramiDto) {
    const { id } = req.user;
    const crami = await this.cramiEntity.findOne({ where: { code: body.code } });
    if (!crami) {
      throw new HttpException('当前卡密不存在、请确认您输入的卡密是否正确！', HttpStatus.BAD_REQUEST);
    }
    const { status, days = -1, model3Count = 0, model4Count = 0, drawMjCount = 0, packageId } = crami;
    if (status === 1) {
      throw new HttpException('当前卡密已被使用、请确认您输入的卡密是否正确！', HttpStatus.BAD_REQUEST);
    }
    const balanceInfo = { model3Count, model4Count, drawMjCount, packageId };
    await this.userBalanceService.addBalanceToUser(id, { ...balanceInfo }, days);
    await this.userBalanceService.saveRecordRechargeLog({
      userId: id,
      rechargeType: RechargeType.PACKAGE_GIFT,
      model3Count,
      model4Count,
      drawMjCount,
      days,
    });
    await this.cramiEntity.update({ code: body.code }, { useId: id, status: 1 });
    return '使用卡密成功';
  }

  /* 查询所有卡密 */
  async queryAllCrami(params: QuerAllCramiDto, req: Request) {
    const { page = 1, size = 10, status, useId } = params;
    const where = {};
    status && Object.assign(where, { status });
    useId && Object.assign(where, { useId });
    const [rows, count] = await this.cramiEntity.findAndCount({
      skip: (page - 1) * size,
      take: size,
      order: { createdAt: 'DESC' },
      where,
    });
    const userIds = rows.map((t) => t.useId);
    const packageIds = rows.map((t) => t.packageId);
    const userInfos = await this.userEntity.find({ where: { id: In(userIds) } });
    const packageInfos = await this.cramiPackageEntity.find({ where: { id: In(packageIds) } });
    rows.forEach((t: any) => {
      t.username = userInfos.find((u) => u.id === t.useId)?.username;
      t.email = userInfos.find((u) => u.id === t.useId)?.email;
      t.packageName = packageInfos.find((p) => p.id === t.packageId)?.name;
    });
    req.user.role !== 'super' && rows.forEach((t: any) => (t.email = maskEmail(t.email)));
    req.user.role !== 'super' && rows.forEach((t: any) => (t.code = maskCrami(t.code)));
    return { rows, count };
  }

  /* 删除卡密 */
  async delCrami(id) {
    const c = await this.cramiEntity.findOne({ where: { id } });
    if (!c) {
      throw new HttpException('当前卡密不存在、请确认您要删除的卡密是否存在！', HttpStatus.BAD_REQUEST);
    }
    if (c.status === 1) {
      throw new HttpException('当前卡密已被使用、已使用的卡密禁止删除！', HttpStatus.BAD_REQUEST);
    }
    return await this.cramiEntity.delete({ id });
  }

  async batchDelCrami(body: BatchDelCramiDto) {
    const { ids } = body;
    const res = await this.cramiEntity.delete(ids);
    if (res.affected > 0) {
      return '删除卡密成功！';
    } else {
      throw new HttpException('删除卡密失败、请重试！', HttpStatus.BAD_REQUEST);
    }
  }
}
