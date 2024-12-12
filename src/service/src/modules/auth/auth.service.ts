import {
  UserStatusEnum,
  UserStatusErrMsg,
} from '@/common/constants/user.constant';
import { createRandomCode, createRandomUid, getClientIp } from '@/common/utils';
import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import * as os from 'os';
import { Repository } from 'typeorm';
import { ConfigEntity } from '../globalConfig/config.entity';
import { MailerService } from '../mailer/mailer.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserService } from '../user/user.service';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { UserEntity } from './../user/user.entity';
import { VerificationService } from './../verification/verification.service';
import { UserLoginDto } from './dto/authLogin.dto';
import { UpdatePassByOtherDto } from './dto/updatePassByOther.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';

@Injectable()
export class AuthService {
  private ipAddress: string;

  constructor(
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    private userService: UserService,
    private jwtService: JwtService,
    private mailerService: MailerService,
    private readonly verificationService: VerificationService,
    private readonly userBalanceService: UserBalanceService,
    private readonly redisCacheService: RedisCacheService,
    private readonly globalConfigService: GlobalConfigService // private readonly userEntity: Repository<UserEntity>
  ) {}

  async onModuleInit() {
    this.getIp();
  }

  async register(body: any, req: Request) {
    const { password, contact, code } = body;
    let email = '',
      phone = '';

    // 判断 contact 是邮箱还是手机号
    const isEmail = /\S+@\S+\.\S+/.test(contact);
    const isPhone = /^\d{10,}$/.test(contact); // 根据实际需求调整正则表达式
    Logger.debug(
      `Contact: ${contact}, isEmail: ${isEmail}, isPhone: ${isPhone}`
    );

    // 创建用户
    let username = createRandomUid();
    while (true) {
      const usernameTaken = await this.userService.verifyUserRegister({
        username,
      });
      Logger.debug(
        `Checking if username ${username} is taken: ${usernameTaken}`
      );
      if (usernameTaken) {
        break;
      }
      username = createRandomUid();
    }

    if (isEmail) {
      email = contact;
      // 调用更新后的验证方法验证邮箱是否已注册
      const isAvailable = await this.userService.verifyUserRegister({
        username,
        email,
      });
      Logger.debug(`Email ${email} is available: ${isAvailable}`);
      if (!isAvailable) {
        throw new HttpException(
          '当前邮箱已注册，请勿重复注册！',
          HttpStatus.BAD_REQUEST
        );
      }
    } else if (isPhone) {
      phone = contact;
      const isAvailable = await this.userService.verifyUserRegister({
        username,
        phone,
      });
      Logger.debug(`Phone ${phone} is available: ${isAvailable}`);
      if (!isAvailable) {
        throw new HttpException(
          '当前手机号已注册，请勿重复注册！',
          HttpStatus.BAD_REQUEST
        );
      }
    } else {
      throw new HttpException(
        '请提供有效的邮箱地址或手机号码。',
        HttpStatus.BAD_REQUEST
      );
    }

    const noVerifyRegister = await this.globalConfigService.getConfigs([
      'noVerifyRegister',
    ]);
    Logger.debug(`noVerifyRegister: ${noVerifyRegister}`);

    if (noVerifyRegister !== '1') {
      // 校验验证码是否过期或错误
      const nameSpace = await this.globalConfigService.getNamespace();
      const key = `${nameSpace}:CODE:${contact}`;
      const redisCode = await this.redisCacheService.get({ key });
      Logger.debug(`Retrieved redisCode for ${contact}: ${redisCode}`);
      if (code === '') {
        throw new HttpException('请输入验证码', HttpStatus.BAD_REQUEST);
      }
      if (!redisCode) {
        Logger.log(`验证码过期: ${contact}`, 'authService');
        throw new HttpException(
          '验证码已过期，请重新发送！',
          HttpStatus.BAD_REQUEST
        );
      }

      if (code !== redisCode) {
        Logger.log(
          `验证码错误: ${contact} 输入的验证码: ${code}, 期望的验证码: ${redisCode}`,
          'authService'
        );
        throw new HttpException(
          '验证码填写错误，请重新输入！',
          HttpStatus.BAD_REQUEST
        );
      }
    }

    let newUser: any;
    if (isEmail) {
      newUser = {
        username,
        password,
        email: contact,
        status: UserStatusEnum.ACTIVE,
      };
    } else {
      const email = `${createRandomUid()}@aiweb.com`;
      newUser = {
        username,
        password,
        email,
        phone: contact,
        status: UserStatusEnum.ACTIVE,
      };
    }

    Logger.debug('获取默认用户头像...');
    const userDefautlAvatar = await this.globalConfigService.getConfigs([
      'userDefautlAvatar',
    ]);
    Logger.debug(`使用默认用户头像: ${userDefautlAvatar}`);
    newUser.avatar = userDefautlAvatar;
    Logger.debug('加密用户密码...');
    const hashedPassword = bcrypt.hashSync(password, 10);
    newUser.password = hashedPassword;
    Logger.debug('保存新用户到数据库...');
    const u = await this.userService.createUser(newUser);
    Logger.debug(`用户创建成功，用户ID: ${u.id}`);
    /* 如果有邀请人 给与充值奖励 */
    await this.userBalanceService.addBalanceToNewUser(u.id);
    Logger.debug('完成新用户余额处理');
    return { success: true, message: '注册成功' };
  }

  async login(user: UserLoginDto, req: Request): Promise<string> {
    console.log(`开始用户登录流程，用户名: ${user.username}`);

    // 验证用户凭证
    const u: UserEntity = await this.userService.verifyUserCredentials(user);
    if (!u) {
      console.error(`登录失败: 用户凭证无效 - 用户名: ${user.username}`);
      throw new HttpException(
        '登录失败，用户凭证无效。',
        HttpStatus.UNAUTHORIZED
      );
    }

    const { username, id, email, role, openId, client, phone } = u;
    console.log(`用户凭证验证成功，用户ID: ${id}, 用户名: ${username}`);

    // 保存登录IP
    const ip = getClientIp(req);
    await this.userService.savaLoginIp(id, ip);
    console.log(`保存登录IP: ${ip} - 用户ID: ${id}`);

    // 生成JWT令牌
    const token = await this.jwtService.sign({
      username,
      id,
      email,
      role,
      openId,
      client,
      phone,
    });
    console.log(`JWT令牌生成成功 - 用户ID: ${id}`);

    // 保存令牌到Redis
    await this.redisCacheService.saveToken(id, token);
    console.log(`令牌已保存到Redis - 用户ID: ${id}`);

    return token;
  }

  async loginWithCaptcha(body: any, req: Request): Promise<string> {
    const { contact, code } = body;
    let email = '',
      phone = '';

    // 判断 contact 是邮箱还是手机号
    const isEmail = /\S+@\S+\.\S+/.test(contact);
    const isPhone = /^\d{10,}$/.test(contact); // 根据实际需求调整正则表达式

    if (isEmail) {
      email = contact;
    } else if (isPhone) {
      phone = contact;
    } else {
      throw new HttpException(
        '请提供有效的邮箱地址或手机号码。',
        HttpStatus.BAD_REQUEST
      );
    }
    const isAvailable = await this.userService.verifyUserRegister({
      email,
      phone,
    });

    // 校验验证码是否过期或错误
    const nameSpace = await this.globalConfigService.getNamespace();
    const key = `${nameSpace}:CODE:${contact}`;
    const redisCode = await this.redisCacheService.get({ key });
    if (!redisCode) {
      Logger.log(`验证码过期: ${contact}`, 'authService');
      throw new HttpException(
        '验证码已过期，请重新发送！',
        HttpStatus.BAD_REQUEST
      );
    }
    if (code !== redisCode) {
      Logger.log(
        `验证码错误: ${contact} 输入的验证码: ${code}, 期望的验证码: ${redisCode}`,
        'authService'
      );
      throw new HttpException(
        '验证码填写错误，请重新输入！',
        HttpStatus.BAD_REQUEST
      );
    }

    let u;
    if (isAvailable) {
      // 验证用户凭证
      u = await this.userService.createUserFromContact({ email, phone });
    } else {
      u = await this.userService.getUserByContact({ email, phone });
    }

    if (!u) {
      throw new HttpException(
        '登录失败，用户凭证无效。',
        HttpStatus.UNAUTHORIZED
      );
    }

    const { username, id, role, openId, client } = u;
    console.log(`用户凭证验证成功，用户ID: ${id}, 用户名: ${username}`);

    // 保存登录IP
    const ip = getClientIp(req);
    await this.userService.savaLoginIp(id, ip);
    console.log(`保存登录IP: ${ip} - 用户ID: ${id}`);

    // 生成JWT令牌
    const token = await this.jwtService.sign({
      username,
      id,
      email,
      role,
      openId,
      client,
      phone,
    });
    console.log(`JWT令牌生成成功 - 用户ID: ${id}`);

    // 保存令牌到Redis
    await this.redisCacheService.saveToken(id, token);
    console.log(`令牌已保存到Redis - 用户ID: ${id}`);

    return token;
  }

  async loginByOpenId(user: UserEntity, req: Request): Promise<string> {
    const { status } = user;
    if (status !== UserStatusEnum.ACTIVE) {
      throw new HttpException(UserStatusErrMsg[status], HttpStatus.BAD_REQUEST);
    }
    const { username, id, email, role, openId, client } = user;
    const ip = getClientIp(req);
    await this.userService.savaLoginIp(id, ip);
    const token = await this.jwtService.sign({
      username,
      id,
      email,
      role,
      openId,
      client,
    });
    await this.redisCacheService.saveToken(id, token);
    return token;
  }

  async getInfo(req: Request) {
    const { id } = req.user;
    return await this.userService.getUserInfo(id);
  }

  async updatePassword(req: Request, body: UpdatePasswordDto) {
    const { id, client, role } = req.user;
    if (client && Number(client) > 0) {
      throw new HttpException(
        '无权此操作、请联系管理员！',
        HttpStatus.BAD_REQUEST
      );
    }
    if (role === 'admin') {
      throw new HttpException(
        '非法操作、请联系管理员！',
        HttpStatus.BAD_REQUEST
      );
    }
    // const bool = await this.userService.verifyUserPassword(id, body.oldPassword);
    // if (!bool) {
    //   throw new HttpException('旧密码错误、请检查提交', HttpStatus.BAD_REQUEST);
    // }
    this.userService.updateUserPassword(id, body.password);
    return '密码修改成功';
  }

  async updatePassByOther(req: Request, body: UpdatePassByOtherDto) {
    const { id, client } = req.user;
    if (!client) {
      throw new HttpException('无权此操作！', HttpStatus.BAD_REQUEST);
    }
    this.userService.updateUserPassword(id, body.password);
    return '密码修改成功';
  }

  getIp() {
    let ipAddress: string;
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach((interfaceName) => {
      const interfaceInfo = interfaces[interfaceName];
      for (let i = 0; i < interfaceInfo.length; i++) {
        const alias = interfaceInfo[i];
        if (
          alias.family === 'IPv4' &&
          alias.address !== '127.0.0.1' &&
          !alias.internal
        ) {
          ipAddress = alias.address;
          break;
        }
      }
    });
    this.ipAddress = ipAddress;
  }

  /* 发送验证证码 */
  async sendCode(body: any) {
    const { contact, isLogin } = body;

    let email = '',
      phone = '';
    const code = createRandomCode();

    // 判断 contact 是邮箱还是手机号
    const isEmail = /\S+@\S+\.\S+/.test(contact);
    const isPhone = /^\d{10,}$/.test(contact); // 根据实际需求调整正则表达式

    if (!isEmail && !isPhone) {
      throw new HttpException(
        '请提供有效的邮箱地址或手机号码。',
        HttpStatus.BAD_REQUEST
      );
    }

    if (!isLogin) {
      if (isEmail) {
        email = contact;
        const isAvailable = await this.userService.verifyUserRegister({
          email,
        });
        if (!isAvailable) {
          throw new HttpException(
            '当前邮箱已注册，请勿重复注册！',
            HttpStatus.BAD_REQUEST
          );
        }
      } else if (isPhone) {
        phone = contact;
        const isAvailable = await this.userService.verifyUserRegister({
          phone,
        });
        if (!isAvailable) {
          throw new HttpException(
            '当前手机号已注册，请勿重复注册！',
            HttpStatus.BAD_REQUEST
          );
        }
      }
    }

    const nameSpace = await this.globalConfigService.getNamespace();
    const key = `${nameSpace}:CODE:${contact}`;

    // 检查Redis中是否已经有验证码且未过期
    const ttl = await this.redisCacheService.ttl(key);
    if (ttl && ttl > 0 && isPhone) {
      throw new HttpException(
        `${ttl}秒内不得重复发送验证码！`,
        HttpStatus.BAD_REQUEST
      );
    }

    if (isEmail) {
      // 检查Redis中是否已经有验证码
      const existingCode = await this.redisCacheService.get({ key });
      if (existingCode) {
        // 如果存在有效的验证码，则直接使用这个验证码，而不生成新的
        await this.mailerService.sendMail({
          to: email,
          context: {
            // 这里传入模板中使用的变量和数据
            code: existingCode,
          },
        });
        return `验证码发送成功、请填写验证码完成注册！`;
      } else {
        // 如果没有现有验证码或验证码已过期，则生成新的验证码

        // const messageInfo = { email, code };
        try {
          await this.mailerService.sendMail({
            to: email,
            context: {
              // 这里传入模板中使用的变量和数据
              code: code,
            },
          });

          console.log('邮件发送成功'); // 如果邮件发送成功，打印成功的消息
        } catch (error) {
          console.error('邮件发送失败', error); // 捕获并处理异常
        }
        await this.redisCacheService.set({ key, val: code }, 10 * 60); // 设置验证码600秒过期
        return `验证码发送成功、请填写验证码完成注册！`;
      }
    } else if (isPhone) {
      const messageInfo = { phone, code };
      await this.verificationService.sendPhoneCode(messageInfo);
      await this.redisCacheService.set({ key, val: code }, 10 * 60);
      return `验证码发送成功、请填写验证码完成注册！`;
    }
  }

  /* 发送验证证码 */
  async sendPhoneCode(body: any) {
    const { phone, isLogin } = body;
    // const { id } = req.user;
    const code = createRandomCode();
    // 判断 contact 是邮箱还是手机号
    const isPhone = /^\d{10,}$/.test(phone); // 根据实际需求调整正则表达式

    if (!isPhone) {
      throw new HttpException(
        '请提供有效的邮箱地址或手机号码。',
        HttpStatus.BAD_REQUEST
      );
    }

    if (isLogin) {
      if (isPhone) {
        const isAvailable = await this.userService.verifyUserRegister({
          phone,
        });
        if (!isAvailable) {
          throw new HttpException(
            '当前手机号已注册，请勿重复注册！',
            HttpStatus.BAD_REQUEST
          );
        }
      }
    }

    const nameSpace = await this.globalConfigService.getNamespace();
    const key = `${nameSpace}:CODE:${phone}`;

    // 检查Redis中是否已经有验证码且未过期
    const ttl = await this.redisCacheService.ttl(key);
    if (ttl && ttl > 0 && isPhone) {
      throw new HttpException(
        `${ttl}秒内不得重复发送验证码！`,
        HttpStatus.BAD_REQUEST
      );
    }

    const messageInfo = { phone, code };
    await this.redisCacheService.set({ key, val: code }, 10 * 60);
    await this.verificationService.sendPhoneCode(messageInfo);

    return `验证码发送成功、请填写验证码完成认证！`;
  }

  /* create token */
  createTokenFromFingerprint(fingerprint) {
    const token = this.jwtService.sign({
      username: `游客${fingerprint}`,
      id: fingerprint,
      email: `${fingerprint}@visitor.com`,
      role: 'visitor',
      openId: null,
      client: null,
    });
    return token;
  }

  async verifyIdentity(req: Request, body) {
    Logger.debug('开始实名认证流程');
    const { name, idCard } = body;

    const { id } = req.user;

    try {
      // 调用验证服务进行身份验证
      const result = await this.verificationService.verifyIdentity(body);

      // 输出验证结果到日志
      Logger.debug(`实名认证结果: ${result}`);

      // 检查验证结果
      if (!result) {
        throw new HttpException(
          '身份验证错误，请检查实名信息',
          HttpStatus.BAD_REQUEST
        );
      }
      // 保存用户的实名信息
      await this.userService.saveRealNameInfo(id, name, idCard);
      return '认证成功';
    } catch (error) {
      // 处理可能的错误并记录错误信息
      Logger.error('验证过程出现错误', error);
      throw new HttpException(
        '认证失败，请检查相关信息',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async verifyPhoneIdentity(req: Request, body) {
    Logger.debug('开始手机号认证流程');
    const { phone, username, password, code } = body;
    const { id } = req.user;

    // 校验验证码是否过期或错误
    const nameSpace = this.globalConfigService.getNamespace();
    const key = `${nameSpace}:CODE:${phone}`;
    const redisCode = await this.redisCacheService.get({ key });
    Logger.debug(`Retrieved redisCode for ${phone}: ${redisCode}`);
    if (code === '') {
      throw new HttpException('请输入验证码', HttpStatus.BAD_REQUEST);
    }
    if (!redisCode) {
      Logger.log(`验证码过期: ${phone}`, 'authService');
      throw new HttpException(
        '验证码已过期，请重新发送！',
        HttpStatus.BAD_REQUEST
      );
    }

    if (code !== redisCode) {
      Logger.log(
        `验证码错误: ${phone} 输入的验证码: ${code}, 期望的验证码: ${redisCode}`,
        'authService'
      );
      throw new HttpException(
        '验证码填写错误，请重新输入！',
        HttpStatus.BAD_REQUEST
      );
    }

    // 验证用户名是否已存在
    if (username) {
      const usernameTaken = await this.userService.isUsernameTaken(
        body.username,
        id
      );
      if (usernameTaken) {
        throw new HttpException('用户名已存在！', HttpStatus.BAD_REQUEST);
      }
    }

    try {
      // 保存用户的实名信息
      await this.userService.updateUserPhone(id, phone, username, password);
      return '认证成功';
    } catch (error) {
      // 处理可能的错误并记录错误信息
      Logger.error('验证过程出现错误', error);
      throw new HttpException(
        '身份验证错误，请检查相关信息',
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
