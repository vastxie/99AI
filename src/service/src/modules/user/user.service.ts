import { RechargeType } from '@/common/constants/balance.constant';
import { VerificationEnum } from '@/common/constants/verification.constant';
import {
  createRandomUid,
  getClientIp,
  maskEmail,
  maskIpAddress,
} from '@/common/utils';
import { MailerService } from '../mailer/mailer.service';

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import * as _ from 'lodash';
import { Connection, In, Like, Not, Repository, UpdateResult } from 'typeorm';
import { UserRegisterDto } from '../auth/dto/authRegister.dto';
import { ConfigEntity } from '../globalConfig/config.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import {
  UserStatusEnum,
  UserStatusErrMsg,
} from './../../common/constants/user.constant';
import { GlobalConfigService } from './../globalConfig/globalConfig.service';
import { VerificationService } from './../verification/verification.service';
import { VerifycationEntity } from './../verification/verifycation.entity';
import { QueryAllUserDto } from './dto/queryAllUser.dto';
import { ResetUserPassDto } from './dto/resetUserPass.dto';
import { UpdateUserDto } from './dto/updateUser.dto';
import { UpdateUserStatusDto } from './dto/updateUserStatus.dto';
import { UserRechargeDto } from './dto/userRecharge.dto';
import { UserEntity } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    private readonly connection: Connection,
    private readonly verificationService: VerificationService,
    private readonly mailerService: MailerService,
    private readonly userBalanceService: UserBalanceService,
    private readonly globalConfigService: GlobalConfigService,
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>
  ) {}

  /* create and verify */
  async createUserAndVerifycation(
    user: UserEntity | UserRegisterDto,
    req: Request
  ): Promise<UserEntity> {
    const { username, email, password, client = 0 } = user;

    /* 用户是否已经在系统中 */
    const where = [{ username }, { email }];
    const u: UserEntity = await this.userEntity.findOne({ where: where });

    if (u && u.status !== UserStatusEnum.PENDING) {
      throw new HttpException(
        '用户名或者邮箱已被注册！',
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const userInput: any = _.cloneDeep(user);
      const hashedPassword = bcrypt.hashSync(password, 10);
      const ip = getClientIp(req);
      userInput.password = hashedPassword;
      userInput.registerIp = ip;
      userInput.client = client;

      let n: UserEntity;
      /* 如果没有注册用户则首次注册记录 如果注册了覆盖发送验证码即可 无需记录用户 */
      if (!u) {
        const userDefautlAvatar = await this.globalConfigService.getConfigs([
          'userDefautlAvatar',
        ]);
        userInput.avatar = userDefautlAvatar;
        n = await this.userEntity.save(userInput);
      } else {
        n = u;
      }
      const emailConfigs = await this.configEntity.find({
        where: {
          configKey: In([
            'isVerifyEmail',
            'registerBaseUrl',
            'registerVerifyEmailTitle',
            'registerVerifyEmailDesc',
            'registerVerifyEmailFrom',
            'registerVerifyExpir',
          ]),
        },
      });

      const configMap: any = emailConfigs.reduce((pre, cur: any) => {
        pre[cur.configKey] = cur.configVal;
        return pre;
      }, {});

      const isVerifyEmail = configMap['isVerifyEmail']
        ? Number(configMap['isVerifyEmail'])
        : 1;
      if (isVerifyEmail) {
        const expir = configMap['registerVerifyExpir']
          ? Number(configMap['registerVerifyExpir'])
          : 30 * 60;
        const v: VerifycationEntity =
          await this.verificationService.createVerification(
            n,
            VerificationEnum.Registration,
            expir
          );
        const { code, email, id } = v;
        const { registerVerifyEmailFrom } = configMap;
        console.log('configMap: ', configMap);

        console.log(`尝试发送邮件到: ${email}`); // 在尝试发送邮件之前打印日志

        // try {
        //   await this.mailerService.sendMail({
        //     to: email,
        //     subject: `来自${registerVerifyEmailFrom}的账号激活`,
        //     context: {
        //       // 这里传入模板中使用的变量和数据
        //       registerVerifyEmailTitle: configMap['registerVerifyEmailTitle'],
        //       registerVerifyEmailDesc: configMap['registerVerifyEmailDesc'],
        //       baseUrl: configMap['registerBaseUrl'],
        //       code: code,
        //       id: id,
        //       registerVerifyEmailFrom: registerVerifyEmailFrom,
        //     },
        //   });

        //   console.log('邮件发送成功'); // 如果邮件发送成功，打印成功的消息
        // } catch (error) {
        //   console.error('邮件发送失败', error); // 捕获并处理异常
        //   // 在这里可以进一步处理错误，比如重试发送、记录错误详情到日志系统、通知管理员等
        // }
      } else {
        /* 如果没有邮箱验证则 则直接主动注册验证通过逻辑 */
        const { id } = n;
        await this.updateUserStatus(id, UserStatusEnum.ACTIVE);
        await this.userBalanceService.addBalanceToNewUser(id);
      }
      return n;
    } catch (error) {
      console.log('error: ', error);
      throw error;
    }
  }

  async getSuper() {
    const user = await this.userEntity.findOne({ where: { role: 'super' } });
    return user;
  }

  /* 账号登录验证密码 扫码登录则不用 */
  async verifyUserCredentials(user): Promise<UserEntity> {
    const { username, password, uid = 0, phone } = user;
    let u = null;

    /* 三方登录的 */
    if (uid > 0) {
      u = await this.userEntity.findOne({ where: { id: uid } });
      if (!u) {
        throw new HttpException('当前账户不存在！', HttpStatus.BAD_REQUEST);
      }
      if (!bcrypt.compareSync(password, u.password)) {
        throw new HttpException('当前密码错误！', HttpStatus.BAD_REQUEST);
      }
    }

    /* 普通登录 */
    if (username && password) {
      const where: any = [
        { username },
        { email: username },
        { phone: username },
      ];
      u = await this.userEntity.findOne({ where: where });
      if (!u) {
        throw new HttpException('当前账户不存在！', HttpStatus.BAD_REQUEST);
      }
      if (!bcrypt.compareSync(password, u.password)) {
        throw new HttpException('当前密码错误！', HttpStatus.BAD_REQUEST);
      }
    }

    if (!u) {
      throw new HttpException('当前账户不存在！', HttpStatus.BAD_REQUEST);
    }
    if (u.status !== UserStatusEnum.ACTIVE) {
      throw new HttpException(
        UserStatusErrMsg[u.status],
        HttpStatus.BAD_REQUEST
      );
    }

    return u;
  }

  async verifyUserPassword(userId, password) {
    const u = await this.userEntity.findOne({ where: { id: userId } });
    return bcrypt.compareSync(password, u.password);
  }

  async updateUserStatus(id: number, status: UserStatusEnum) {
    const u: UpdateResult = await this.userEntity.update({ id }, { status });
    return u.affected > 0;
  }

  async getUserStatus(id: number): Promise<number> {
    const u: UserEntity = await this.userEntity.findOne({ where: { id } });
    return u.status;
  }

  async queryUserInfoById(id: number): Promise<UserEntity> {
    return await this.userEntity.findOne({ where: { id } });
  }

  async queryOneUserInfo(userId: number): Promise<UserEntity> {
    return await this.userEntity.findOne({ where: { id: userId } });
  }

  /* 检查用户状态 */
  async checkUserStatus(user) {
    const { id: userId, role } = user;
    if (role === 'visitor') return true;
    const u = await this.userEntity.findOne({ where: { id: userId } });
    if (!u) {
      throw new HttpException(
        '当前用户信息失效、请重新登录！',
        HttpStatus.UNAUTHORIZED
      );
    }
    if (u.status === UserStatusEnum.BLACKLISTED) {
      throw new HttpException(
        '您的账户已被永久加入黑名单、如有疑问、请联系管理员！',
        HttpStatus.BAD_REQUEST
      );
    }
    if (u.status === UserStatusEnum.LOCKED) {
      throw new HttpException(
        '您的账户已被封禁、如有疑问、请联系管理员！',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /* 获取用户基础信息 */
  async getUserInfo(userId: number) {
    const userInfo: any = await this.userEntity.findOne({
      where: { id: userId },
      select: [
        'username',
        'avatar',
        'role',
        'email',
        'sign',
        'openId',
        'consecutiveDays',
      ],
    });

    if (!userInfo) {
      throw new HttpException(
        '当前用户信息失效、请重新登录！',
        HttpStatus.UNAUTHORIZED
      );
    }

    userInfo.isBindWx = !!userInfo?.openId;
    delete userInfo.openId;

    const userBalance = await this.userBalanceService.queryUserBalance(userId);

    // 对id进行处理
    const processedId = (userId * 123 + 100000000)
      .toString(36)
      .toUpperCase()
      .slice(-6);

    // 将处理后的id放入userInfo对象中
    userInfo.id = processedId;

    return { userInfo, userBalance: { ...userBalance } };
  }

  /* 获取用户信息 */
  async getUserById(id: number) {
    return await this.userEntity.findOne({ where: { id } });
  }

  /* 通过openId获取用户信息 */
  async getUserOpenId(openId: string) {
    return await this.userEntity.findOne({ where: { openId } });
  }

  /* 修改用户信息 */
  async updateInfo(body: UpdateUserDto, req: Request) {
    const { id } = req.user;

    const u = await this.userEntity.findOne({ where: { id } });
    if (!u) {
      throw new HttpException('当前用户不存在！', HttpStatus.BAD_REQUEST);
    }
    if (body.username && u.username === body.username) {
      throw new HttpException('没有变更，无需更改！', HttpStatus.BAD_REQUEST);
    }

    if (body.username) {
      const usernameTaken = await this.isUsernameTaken(body.username, id);
      if (usernameTaken) {
        throw new HttpException('用户名已存在！', HttpStatus.BAD_REQUEST);
      }
    }

    const r = await this.userEntity.update({ id }, body);
    if (r.affected <= 0) {
      throw new HttpException('修改用户信息失败！', HttpStatus.BAD_REQUEST);
    }
    return '修改用户信息成功！';
  }

  /* 检查用户名是否已存在 */
  async isUsernameTaken(
    username: string,
    excludeUserId?: number
  ): Promise<boolean> {
    const where: any = { username };
    if (excludeUserId) {
      where.id = Not(excludeUserId);
    }
    const user = await this.userEntity.findOne({ where });
    return !!user;
  }

  /* 修改用户密码 */
  async updateUserPassword(userId: number, password: string) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const r = await this.userEntity.update(
      { id: userId },
      { password: hashedPassword }
    );
    if (r.affected <= 0) {
      throw new HttpException(
        '修改密码失败、请重新试试吧。',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /* 给用户充值 */
  async userRecharge(body: UserRechargeDto) {
    const { userId, model3Count = 0, model4Count = 0, drawMjCount = 0 } = body;
    await this.userBalanceService.addBalanceToUser(userId, {
      model3Count,
      model4Count,
      drawMjCount,
    });
    const res = await this.userBalanceService.saveRecordRechargeLog({
      userId,
      rechargeType: RechargeType.ADMIN_GIFT,
      model3Count,
      model4Count,
      drawMjCount,
      extent: '',
    });
    return res;
  }

  /* 查询所有用户 */
  async queryAll(query: QueryAllUserDto, req: Request) {
    const {
      page = 1,
      size = 10,
      username,
      email,
      status,
      keyword,
      phone,
    } = query;
    let where = {};
    username && Object.assign(where, { username: Like(`%${username}%`) });
    email && Object.assign(where, { email: Like(`%${email}%`) });
    phone && Object.assign(where, { phone: Like(`%${phone}%`) });
    status && Object.assign(where, { status });
    if (keyword) {
      where = [
        { username: Like(`%${keyword}%`) },
        { email: Like(`%${keyword}%`) },
        { phone: Like(`%${keyword}%`) },
      ];
    }
    const [rows, count] = await this.userEntity.findAndCount({
      skip: (page - 1) * size,
      where,
      take: size,
      order: { createdAt: 'DESC' },
      cache: true,
      select: [
        'username',
        'avatar',
        'role',
        'sign',
        'status',
        'id',
        'email',
        'createdAt',
        'lastLoginIp',
        'phone',
        'realName',
        'idCard',
      ],
    });
    const ids = rows.map((t) => t.id);
    const data = await this.userBalanceService.queryUserBalanceByIds(ids);
    rows.forEach(
      (user: any) => (user.balanceInfo = data.find((t) => t.userId === user.id))
    );
    req.user.role !== 'super' &&
      rows.forEach((t) => (t.email = maskEmail(t.email)));
    req.user.role !== 'super' &&
      rows.forEach((t) => (t.lastLoginIp = maskIpAddress(t.lastLoginIp)));
    req.user.role !== 'super' &&
      rows.forEach((t) => (t.phone = maskIpAddress(t.phone)));
    return { rows, count };
  }

  /* 查询单个用户详情 */
  async queryOne({ id }) {
    return await this.userEntity.findOne({
      where: { id },
      select: ['username', 'avatar', 'role', 'sign', 'status'],
    });
  }

  /* 修改用户状态 */
  async updateStatus(body: UpdateUserStatusDto) {
    const { id, status } = body;
    const n = await this.userEntity.findOne({ where: { id } });
    if (!n) {
      throw new HttpException('用户不存在！', HttpStatus.BAD_REQUEST);
    }
    if (n.role === 'super') {
      throw new HttpException('超级管理员不可被操作！', HttpStatus.BAD_REQUEST);
    }
    // if (n.status === UserStatusEnum.PENDING) {
    //   throw new HttpException('未激活用户不可手动变更状态！', HttpStatus.BAD_REQUEST);
    // }
    if (n.role === 'super') {
      throw new HttpException('超级管理员不可被操作！', HttpStatus.BAD_REQUEST);
    }
    // if (status === UserStatusEnum.PENDING) {
    //   throw new HttpException('不可将用户置为未激活状态！', HttpStatus.BAD_REQUEST);
    // }
    const r = await this.userEntity.update({ id }, { status });
    if (r.affected <= 0) {
      throw new HttpException('修改用户状态失败！', HttpStatus.BAD_REQUEST);
    }
    return '修改用户状态成功！';
  }

  /* 重置用户密码 */
  async resetUserPass(body: ResetUserPassDto) {
    const { id } = body;
    const u = await this.userEntity.findOne({ where: { id } });
    if (!u) {
      throw new HttpException('用户不存在！', HttpStatus.BAD_REQUEST);
    }
    const defaultPassword = '123456';
    const hashPassword = bcrypt.hashSync(defaultPassword, 10);
    const raw = await this.userEntity.update(
      { id },
      { password: hashPassword }
    );
    if (raw.affected <= 0) {
      throw new HttpException('重置密码失败！', HttpStatus.BAD_REQUEST);
    }
    return `密码重置为[${defaultPassword}]成功!`;
  }

  /* 记录登录ip */
  async savaLoginIp(userId: number, ip: string) {
    return await this.userEntity.update({ id: userId }, { lastLoginIp: ip });
  }

  /* 通过openId 拿到或创建 */
  async getUserFromOpenId(openId: string, sceneStr?: string) {
    const user = await this.userEntity.findOne({ where: { openId } });
    if (!user) {
      const user = await this.createUserFromOpenId(openId);
      await this.userBalanceService.addBalanceToNewUser(user.id);
      return user;
    }
    return user;
  }

  /* 通过openId创建一个用户, 传入邀请码 是邀请人的不是自己的 */
  async createUserFromOpenId(openId: string) {
    const userDefautlAvatar = await this.globalConfigService.getConfigs([
      'userDefautlAvatar',
    ]);
    const userInfo = {
      avatar: userDefautlAvatar,
      username: `用户${createRandomUid()}`,
      status: UserStatusEnum.ACTIVE,
      sex: 0,
      email: `${createRandomUid()}@default.com`,
      openId,
    };
    const user = await this.userEntity.save(userInfo);
    return user;
  }

  /* 通过openId创建一个用户, 传入邀请码 是邀请人的不是自己的 */
  async createUserFromContact(params: any) {
    const { username, email, phone } = params;
    const userDefautlAvatar = await this.globalConfigService.getConfigs([
      'userDefautlAvatar',
    ]);
    // 创建 userInfo 对象时条件性地添加 email 和 phone
    const userInfo: any = {
      avatar: userDefautlAvatar,
      username: `用户${createRandomUid()}`,
      status: UserStatusEnum.ACTIVE,
      sex: 0,
    };

    if (username) {
      userInfo.username = username;
    }

    if (email) {
      userInfo.email = email;
    }

    if (phone) {
      userInfo.phone = phone;
    }

    const user = await this.userEntity.save(userInfo);
    return user;
  }

  async getUserByContact(params: any) {
    const { username, email, phone } = params;
    const where: any = [];
    if (username) {
      where.push({ username });
    }
    if (email) {
      where.push({ email });
    }
    if (phone) {
      where.push({ phone });
    }
    return await this.userEntity.findOne({ where });
  }

  async bindWx(openId, userId) {
    try {
      const user = await this.userEntity.findOne({ where: { id: userId } });
      if (!user) return { status: false, msg: '当前绑定用户不存在！' };
      const bindU = await this.userEntity.findOne({ where: { openId } });
      if (bindU) return { status: false, msg: '该微信已绑定其他账号！' };
      const res = await this.userEntity.update({ id: userId }, { openId });
      if (res.affected <= 0)
        return { status: false, msg: '绑定微信失败、请联系管理员！' };
      return { status: true, msg: '恭喜您绑定成功、后续可直接扫码登录了！' };
    } catch (error) {
      return { status: false, msg: '绑定微信失败、请联系管理员！' };
    }
  }

  /* 通过userId获取用户的openId */
  async getOpenIdByUserId(userId: number) {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    return user?.openId;
  }

  /* 校验手机号/邮箱号注册 */
  async verifyUserRegister(params: any): Promise<boolean> {
    const { username, phone, email } = params;

    // 如果提供了手机号，就验证手机号
    if (phone) {
      const userByPhone = await this.userEntity.findOne({ where: { phone } });
      if (userByPhone) {
        // 手机号已注册，返回 false
        return false;
      }
    }

    // 如果提供了邮箱，就验证邮箱
    if (email) {
      const userByEmail = await this.userEntity.findOne({ where: { email } });
      if (userByEmail) {
        // 邮箱已注册，返回 false
        return false;
      }
    }

    // 验证用户名是否已存在
    if (username) {
      const userByUsername = await this.userEntity.findOne({
        where: { username },
      });
      if (userByUsername) {
        // 用户名已存在，返回 false
        return false;
      }
    }

    if (!phone && !email && !username) {
      return false;
    }

    // 所有检查都通过，没有发现重复的注册信息，返回 true
    return true;
  }

  /* 校验手机号注册 */
  async verifyUserRegisterByPhone(params: any) {
    const { username, password, phone, phoneCode } = params;
    const user = await this.userEntity.findOne({
      where: [{ username }, { phone }],
    });
    if (user && user.username === username) {
      throw new HttpException(
        '用户名已存在、请更换用户名！',
        HttpStatus.BAD_REQUEST
      );
    }
    if (user && user.phone === phone) {
      throw new HttpException(
        '当前手机号已注册、请勿重复注册！',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /* 校验邮箱注册 */
  async verifyUserRegisterByEmail(params: any) {
    const { username, email } = params;
    console.log(`校验邮箱注册: 开始 - 用户名: ${username}, 邮箱: ${email}`);

    // 查找数据库中是否存在该用户名或邮箱
    const user = await this.userEntity.findOne({
      where: [{ username }, { email }],
    });

    // 校验用户名是否已存在
    if (user && user.username === username) {
      console.error(`校验失败: 用户名 "${username}" 已存在`);
      throw new HttpException(
        '用户名已存在、请更换用户名！',
        HttpStatus.BAD_REQUEST
      );
    }

    // 校验邮箱是否已被注册
    // 注意：这里应检查user.email而不是user.phone，除非你的数据模型是这样设计的
    if (user && user.email === email) {
      console.error(`校验失败: 邮箱 "${email}" 已被注册`);
      throw new HttpException(
        '当前邮箱已注册、请勿重复注册！',
        HttpStatus.BAD_REQUEST
      );
    }

    console.log(
      `校验邮箱注册: 成功 - 用户名: ${username}, 邮箱: ${email} 未被占用`
    );
  }

  /* 创建基础用户 */
  async createUser(userInfo) {
    return await this.userEntity.save(userInfo);
  }

  /* 存储实名信息 */
  async saveRealNameInfo(userId: number, realName: string, idCard: string) {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    if (!user) {
      Logger.error('用户不存在');
    }
    await this.userEntity.update({ id: userId }, { realName, idCard });
    return;
  }

  /* 更新用户手机号，用户名，密码 */
  async updateUserPhone(
    userId: number,
    phone: string,
    username: string,
    password: string
  ) {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    const hashedPassword = bcrypt.hashSync(password, 10);
    if (!user) {
      Logger.error('用户不存在');
    }
    if (!phone || !username || !hashedPassword) {
      throw new HttpException('参数错误！', HttpStatus.BAD_REQUEST);
    }
    await this.userEntity.update(
      { id: userId },
      { phone, username, password: hashedPassword }
    );
    return;
  }
}
