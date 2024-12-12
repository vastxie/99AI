import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { In, IsNull, Like, MoreThan, Not, Repository } from 'typeorm';
import { AppEntity } from './app.entity';
import { AppCatsEntity } from './appCats.entity';
import { CollectAppDto } from './dto/collectApp.dto';
import { CreateAppDto } from './dto/createApp.dto';
import { CreateCatsDto } from './dto/createCats.dto';
import { OperateAppDto } from './dto/deleteApp.dto';
import { DeleteCatsDto } from './dto/deleteCats.dto';
import { QuerAppDto } from './dto/queryApp.dto';
import { QuerCatsDto } from './dto/queryCats.dto';
import { UpdateAppDto } from './dto/updateApp.dto';
import { UpdateCatsDto } from './dto/updateCats.dto';
import { UserAppsEntity } from './userApps.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(AppCatsEntity)
    private readonly appCatsEntity: Repository<AppCatsEntity>,
    @InjectRepository(AppEntity)
    private readonly appEntity: Repository<AppEntity>,
    @InjectRepository(UserAppsEntity)
    private readonly userAppsEntity: Repository<UserAppsEntity>
  ) {}

  async createAppCat(body: CreateCatsDto) {
    const { name } = body;
    const c = await this.appCatsEntity.findOne({ where: { name } });
    if (c) {
      throw new HttpException('该分类名称已存在！', HttpStatus.BAD_REQUEST);
    }
    return await this.appCatsEntity.save(body);
  }

  async delAppCat(body: DeleteCatsDto) {
    const { id } = body;
    const c = await this.appCatsEntity.findOne({ where: { id } });
    if (!c) {
      throw new HttpException('该分类不存在！', HttpStatus.BAD_REQUEST);
    }
    const count = await this.appEntity.count({ where: { catId: id } });
    if (count > 0) {
      throw new HttpException(
        '该分类下存在App，不可删除！',
        HttpStatus.BAD_REQUEST
      );
    }
    const res = await this.appCatsEntity.delete(id);
    if (res.affected > 0) return '删除成功';
    throw new HttpException('删除失败！', HttpStatus.BAD_REQUEST);
  }

  async updateAppCats(body: UpdateCatsDto) {
    const { id, name } = body;
    const c = await this.appCatsEntity.findOne({
      where: { name, id: Not(id) },
    });
    if (c) {
      throw new HttpException('该分类名称已存在！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.appCatsEntity.update({ id }, body);
    if (res.affected > 0) return '修改成功';
    throw new HttpException('修改失败！', HttpStatus.BAD_REQUEST);
  }

  async queryOneCat(params) {
    const { id } = params;
    if (!id) {
      throw new HttpException('缺失必要参数！', HttpStatus.BAD_REQUEST);
    }
    const app = await this.appEntity.findOne({ where: { id } });
    // console.log(`查询App详情成功:`, app);
    const {
      demoData: demo,
      coverImg,
      des,
      name,
      isFixedModel,
      isGPTs,
      appModel,
    } = app;
    return {
      demoData: demo ? demo.split('\n') : [],
      coverImg,
      des,
      name,
      isGPTs,
      isFixedModel,
      appModel,
    };
  }

  async appCatsList(query: QuerCatsDto) {
    const { page = 1, size = 10, name, status } = query;
    const where: any = {};
    name && (where.name = Like(`%${name}%`));
    [0, 1, '0', '1'].includes(status) && (where.status = status);
    const [rows, count] = await this.appCatsEntity.findAndCount({
      where,
      order: { order: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    // 查出所有分类下对应的App数量
    const catIds = rows.map((item) => item.id);
    const apps = await this.appEntity.find({ where: { catId: In(catIds) } });
    const appCountMap = {};
    apps.forEach((item) => {
      if (appCountMap[item.catId]) {
        appCountMap[item.catId] += 1;
      } else {
        appCountMap[item.catId] = 1;
      }
    });
    rows.forEach((item: any) => (item.appCount = appCountMap[item.id] || 0));
    return { rows, count };
  }

  async appList(req: Request, query: QuerAppDto, orderKey = 'id') {
    const { page = 1, size = 10, name, status, catId, role } = query;
    const where: any = { isSystemReserved: 0 };
    name && (where.name = Like(`%${name}%`));
    catId && (where.catId = catId);
    role && (where.role = role);
    status && (where.status = status);
    const [rows, count] = await this.appEntity.findAndCount({
      where,
      order: { [orderKey]: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    const catIds = rows.map((item) => item.catId);
    const cats = await this.appCatsEntity.find({ where: { id: In(catIds) } });
    rows.forEach((item: any) => {
      const cat = cats.find((c) => c.id === item.catId);
      item.catName = cat ? cat.name : '';
    });
    if (req?.user?.role !== 'super') {
      rows.forEach((item: any) => {
        delete item.preset;
      });
    }
    return { rows, count };
  }

  async frontAppList(req: Request, query: QuerAppDto, orderKey = 'id') {
    const { page = 1, size = 1000, name, catId, role } = query;
    const where: any = [
      {
        status: In([1, 4]),
        userId: IsNull(),
        public: false,
        isSystemReserved: 0,
      },
      { userId: MoreThan(0), public: true },
    ];
    const [rows, count] = await this.appEntity.findAndCount({
      where,
      order: { order: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    const catIds = rows.map((item) => item.catId);
    const cats = await this.appCatsEntity.find({ where: { id: In(catIds) } });
    rows.forEach((item: any) => {
      const cat = cats.find((c) => c.id === item.catId);
      item.catName = cat ? cat.name : '';
    });
    if (req?.user?.role !== 'super') {
      rows.forEach((item: any) => {
        delete item.preset;
      });
    }
    return { rows, count };
  }

  async searchAppList(body: any) {
    console.log('搜索App列表', body);
    const { page = 1, size = 1000, keyword } = body;
    console.log(`搜索关键词：${keyword}`);

    // 基础查询条件，可以根据实际情况调整
    let baseWhere: any = [
      {
        status: In([1, 4]),
        userId: IsNull(),
        public: false,
        isSystemReserved: 0,
      },
      { userId: MoreThan(0), public: true },
    ];

    console.log('初始查询条件：', JSON.stringify(baseWhere));

    // 如果存在关键字，修改查询条件以同时搜索 name 和 description
    if (keyword) {
      baseWhere = baseWhere.map((condition) => ({
        ...condition,
        name: Like(`%${keyword}%`),
      }));
      console.log('更新后的查询条件：', JSON.stringify(baseWhere));
    }
    try {
      const [rows, count] = await this.appEntity.findAndCount({
        where: baseWhere,
        skip: (page - 1) * size,
        take: size,
      });
      console.log(`查询返回 ${count} 条结果，显示第 ${page} 页的结果。`);

      rows.forEach((item: any) => {
        delete item.preset; // 假设preset是不需要返回给前端的敏感信息
      });

      console.log('完成查询，准备返回结果');
      return { rows, count };
    } catch (error) {
      console.error('查询数据库时出错：', error);
      throw new Error('Database query failed');
    }
  }

  async createApp(body: CreateAppDto) {
    const { name, catId } = body;
    body.role = 'system';
    const a = await this.appEntity.findOne({ where: { name } });
    if (a) {
      throw new HttpException('该应用名称已存在！', HttpStatus.BAD_REQUEST);
    }
    const c = await this.appCatsEntity.findOne({ where: { id: catId } });
    if (!c) {
      throw new HttpException('该分类不存在！', HttpStatus.BAD_REQUEST);
    }
    return await this.appEntity.save(body);
  }

  async updateApp(body: UpdateAppDto) {
    const { id, name, catId, status } = body;
    const a = await this.appEntity.findOne({ where: { name, id: Not(id) } });
    if (a) {
      throw new HttpException('该应用名称已存在！', HttpStatus.BAD_REQUEST);
    }
    const c = await this.appCatsEntity.findOne({ where: { id: catId } });
    if (!c) {
      throw new HttpException('该分类不存在！', HttpStatus.BAD_REQUEST);
    }
    const curApp = await this.appEntity.findOne({ where: { id } });
    if (curApp.status !== body.status) {
      await this.userAppsEntity.update({ appId: id }, { status });
    }
    const res = await this.appEntity.update({ id }, body);
    if (res.affected > 0) return '修改App信息成功';
    throw new HttpException('修改App信息失败！', HttpStatus.BAD_REQUEST);
  }

  async delApp(body: OperateAppDto) {
    const { id } = body;
    const a = await this.appEntity.findOne({ where: { id } });
    if (!a) {
      throw new HttpException('该应用不存在！', HttpStatus.BAD_REQUEST);
    }
    const useApp = await this.userAppsEntity.count({ where: { appId: id } });
    // if (useApp > 0) {
    //   throw new HttpException(
    //     '该应用已被用户关联使用中，不可删除！',
    //     HttpStatus.BAD_REQUEST
    //   );
    // }
    const res = await this.appEntity.delete(id);
    if (res.affected > 0) return '删除App成功';
    throw new HttpException('删除App失败！', HttpStatus.BAD_REQUEST);
  }

  async auditPass(body: OperateAppDto) {
    const { id } = body;
    const a = await this.appEntity.findOne({ where: { id, status: 3 } });
    if (!a) {
      throw new HttpException('该应用不存在！', HttpStatus.BAD_REQUEST);
    }
    await this.appEntity.update({ id }, { status: 4 });
    /* 同步变更useApp status  */
    await this.userAppsEntity.update({ appId: id }, { status: 4 });
    return '应用审核通过';
  }

  async auditFail(body: OperateAppDto) {
    const { id } = body;
    const a = await this.appEntity.findOne({ where: { id, status: 3 } });
    if (!a) {
      throw new HttpException('该应用不存在！', HttpStatus.BAD_REQUEST);
    }
    await this.appEntity.update({ id }, { status: 5 });
    /* 同步变更useApp status  */
    await this.userAppsEntity.update({ appId: id }, { status: 5 });
    return '应用审核拒绝完成';
  }

  async collect(body: CollectAppDto, req: Request) {
    const { appId } = body;
    const { id: userId } = req.user;
    const historyApp = await this.userAppsEntity.findOne({
      where: { appId, userId },
    });
    if (historyApp) {
      const r = await this.userAppsEntity.delete({ appId, userId });
      if (r.affected > 0) {
        return '取消收藏成功!';
      } else {
        throw new HttpException('取消收藏失败！', HttpStatus.BAD_REQUEST);
      }
    }
    const app = await this.appEntity.findOne({ where: { id: appId } });
    const { id, role: appRole, catId } = app;
    const collectInfo = {
      userId,
      appId: id,
      catId,
      appRole,
      public: true,
      status: 1,
    };
    await this.userAppsEntity.save(collectInfo);
    return '已将应用加入到我的收藏！';
  }

  // async mineApps(req: Request, query = { page: 1, size: 30 }) {
  //   const { id } = req.user;
  //   const { page = 1, size = 30 } = query;
  //   const [rows, count] = await this.userAppsEntity.findAndCount({
  //     where: { userId: id, status: In([1, 3, 4, 5]) },
  //     order: { id: 'DESC' },
  //     skip: (page - 1) * size,
  //     take: size,
  //   });

  //   const appIds = rows.map((item) => item.appId);
  //   const appsInfo = await this.appEntity.find({ where: { id: In(appIds) } });
  //   rows.forEach((item: any) => {
  //     const app = appsInfo.find((c) => c.id === item.appId);
  //     item.appName = app ? app.name : '';
  //     item.appRole = app ? app.role : '';
  //     item.appDes = app ? app.des : '';
  //     item.coverImg = app ? app.coverImg : '';
  //     item.demoData = app ? app.demoData : '';
  //     item.preset = app.userId === id ? app.preset : '******';
  //   });
  //   return { rows, count };
  // }

  async mineApps(req: Request, query = { page: 1, size: 30 }) {
    // 记录函数调用时间和查询参数
    // console.log(`mineApps 在 ${new Date().toISOString()} 被调用，查询参数为：`, query);

    const { id } = req.user;
    // console.log(`正在处理用户ID: ${id} 的mineApps请求`); // 记录处理的用户ID

    const { page = 1, size = 30 } = query;
    let rows, count;

    try {
      [rows, count] = await this.userAppsEntity.findAndCount({
        where: { userId: id, status: In([1, 3, 4, 5]) },
        order: { id: 'DESC' },
        skip: (page - 1) * size,
        take: size,
      });

      const appIds = rows.map((item) => item.appId);
      const appsInfo = await this.appEntity.find({ where: { id: In(appIds) } });

      rows.forEach((item: any) => {
        const app = appsInfo.find((c) => c.id === item.appId);
        item.appName = app ? app.name : '未知';
        item.appRole = app ? app.role : '未知';
        item.appDes = app ? app.des : '未知';
        item.coverImg = app ? app.coverImg : '未知';
        item.demoData = app ? app.demoData : '未知';
        item.preset = app.userId === id ? app.preset : '******';
      });
    } catch (error) {
      console.error(`处理用户ID: ${id} 的mineApps请求时发生错误`, error); // 记录可能的错误
      throw error; // 抛出错误，确保上层调用者知道发生了错误
    }

    return { rows, count };
  }
}
