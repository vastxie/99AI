import { UserStatusEnum, UserStatusErrMsg } from '@/common/constants/user.constant';
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
    private readonly globalConfigService: GlobalConfigService, // private readonly userEntity: Repository<UserEntity>
  ) {}

  async onModuleInit() {
    this.getIp();
  }

  async login(user: UserLoginDto, req: Request): Promise<string> {
    Logger.debug(`用户登录尝试，用户名: ${user.username}`, 'authService');

    // 检查是否是验证码登录
    if (user.captchaId) {
      Logger.debug(`检测到验证码登录，联系方式: ${user.username}`, 'authService');
      return await this.loginWithCaptcha({ contact: user.username, code: user.captchaId }, req);
    }

    // 密码登录流程
    const u: UserEntity = await this.userService.verifyUserCredentials(user);
    if (!u) {
      Logger.error(`登录失败: 用户凭证无效 - 用户名: ${user.username}`, 'authService');
      throw new HttpException('登录失败，用户凭证无效。', HttpStatus.UNAUTHORIZED);
    }

    const { username, id, email, role, openId, client, phone } = u;
    Logger.debug(`用户${username}(ID: ${id})登录成功`, 'authService');

    // 保存登录IP
    const ip = getClientIp(req);
    await this.userService.savaLoginIp(id, ip);

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

    // 保存令牌到Redis
    await this.redisCacheService.saveToken(id, token);
    Logger.debug(`用户${username}(ID: ${id})登录完成，IP: ${ip}`, 'authService');

    return token;
  }

  async loginWithCaptcha(body: any, req: Request): Promise<string> {
    const { contact, code } = body;
    let email = '',
      phone = '';

    // 判断 contact 是邮箱还是手机号
    const isEmail = /\S+@\S+\.\S+/.test(contact);
    const isPhone = /^\d{10,}$/.test(contact); // 根据实际需求调整正则表达式
    Logger.debug(`验证码登录 | 联系方式: ${contact}`, 'authService');

    if (isEmail) {
      email = contact;
    } else if (isPhone) {
      phone = contact;
    } else {
      throw new HttpException('请提供有效的邮箱地址或手机号码。', HttpStatus.BAD_REQUEST);
    }

    // 验证短信或邮箱验证码
    const nameSpace = await this.globalConfigService.getNamespace();
    const codeKey = `${nameSpace}:CODE:${contact}`;

    // 获取验证码
    const savedCode = await this.redisCacheService.get({ key: codeKey });

    if (savedCode) {
      // 验证码存在，检查是否匹配
      if (savedCode !== code) {
        Logger.log(`验证码错误 | 联系方式: ${contact}`, 'authService');
        throw new HttpException('验证码错误', HttpStatus.BAD_REQUEST);
      }

      Logger.debug(`验证码验证成功`);

      // 验证码验证成功后，立即删除缓存中的验证码，避免重复使用
      await this.redisCacheService.del({ key: codeKey });

      // 处理用户登录
      return await this.processUserLogin(email, phone, contact, req);
    } else {
      Logger.log(`验证码不存在或已过期 | 联系方式: ${contact}`, 'authService');
      throw new HttpException('验证码不存在或已过期，请重新获取', HttpStatus.BAD_REQUEST);
    }
  }

  // 抽取用户登录处理逻辑为独立方法
  private async processUserLogin(
    email: string,
    phone: string,
    contact: string,
    req: Request,
  ): Promise<string> {
    // 检查用户是否存在
    let u = await this.userService.getUserByContact({ email, phone });

    // 如果用户不存在，创建新用户
    if (!u) {
      Logger.log(`创建新用户 | 联系方式: ${contact}`, 'authService');

      // 创建随机用户名
      let username = createRandomUid();
      while (true) {
        const usernameTaken = await this.userService.verifyUserRegister({
          username,
        });
        if (usernameTaken) {
          break;
        }
        username = createRandomUid();
      }

      // 创建新用户对象
      let newUser: any = {
        username,
        status: UserStatusEnum.ACTIVE,
      };

      // 根据联系方式类型添加相应字段
      const isEmail = /\S+@\S+\.\S+/.test(contact);
      if (isEmail) {
        newUser.email = contact;
      } else {
        // 为手机用户创建一个随机邮箱
        newUser.email = `${createRandomUid()}@aiweb.com`;
        newUser.phone = contact;
      }

      // 创建随机密码并加密
      const randomPassword = createRandomUid().substring(0, 8);
      const hashedPassword = bcrypt.hashSync(randomPassword, 10);
      newUser.password = hashedPassword;

      // 保存新用户到数据库
      u = await this.userService.createUser(newUser);
      Logger.log(`用户创建成功 | 用户ID: ${u.id}`, 'authService');

      // 为新用户添加初始余额
      await this.userBalanceService.addBalanceToNewUser(u.id);
    }

    if (!u) {
      throw new HttpException('登录失败，用户创建失败。', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const { username, id, role, openId, client } = u;

    // 保存登录IP
    const ip = getClientIp(req);
    await this.userService.savaLoginIp(id, ip);

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

    // 保存令牌到Redis
    await this.redisCacheService.saveToken(id, token);
    Logger.log(`用户登录成功 | 用户ID: ${id} | 联系方式: ${contact}`, 'authService');

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
    const { id, role } = req.user;
    Logger.debug(`获取用户信息 | 用户ID: ${id} | 角色: ${role}`, 'AuthService-getInfo');

    // 记录请求头中的指纹
    if (req.headers.fingerprint) {
      Logger.debug(`请求包含指纹头: ${req.headers.fingerprint}`, 'AuthService-getInfo');
    }

    try {
      const result = await this.userService.getUserInfo(id);
      Logger.debug(`成功获取用户信息 | 用户ID: ${id}`, 'AuthService-getInfo');
      return result;
    } catch (error) {
      Logger.error(`获取用户信息失败: ${error.message}`, 'AuthService-getInfo');
      throw error;
    }
  }

  async updatePassword(req: Request, body: UpdatePasswordDto) {
    const { id, client, role } = req.user;
    if (client && Number(client) > 0) {
      throw new HttpException('无权此操作、请联系管理员！', HttpStatus.BAD_REQUEST);
    }
    if (role === 'admin') {
      throw new HttpException('非法操作、请联系管理员！', HttpStatus.BAD_REQUEST);
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
    Object.keys(interfaces).forEach(interfaceName => {
      const interfaceInfo = interfaces[interfaceName];
      for (let i = 0; i < interfaceInfo.length; i++) {
        const alias = interfaceInfo[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
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
    Logger.debug(`发送验证码 | 联系方式: ${contact}`);

    if (!isEmail && !isPhone) {
      throw new HttpException('请提供有效的邮箱地址或手机号码。', HttpStatus.BAD_REQUEST);
    }

    // 注册时才检查用户是否已存在
    if (!isLogin) {
      if (isEmail) {
        email = contact;
      } else if (isPhone) {
        phone = contact;
      }
    }

    const nameSpace = await this.globalConfigService.getNamespace();
    const key = `${nameSpace}:CODE:${contact}`;

    // 检查Redis中是否已经有验证码且未过期
    const ttl = await this.redisCacheService.ttl(key);
    if (ttl && ttl > 0 && isPhone) {
      throw new HttpException(`${ttl}秒内不得重复发送验证码！`, HttpStatus.BAD_REQUEST);
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
        Logger.log(`重发验证码 | 邮箱: ${email}`, 'authService');
        return `验证码发送成功、请填写验证码完成${isLogin ? '登录' : '注册'}！`;
      } else {
        // 如果没有现有验证码或验证码已过期，则生成新的验证码
        try {
          await this.mailerService.sendMail({
            to: email,
            context: {
              // 这里传入模板中使用的变量和数据
              code: code,
            },
          });
          Logger.log(`发送新验证码 | 邮箱: ${email}`, 'authService');
        } catch (error) {
          Logger.error(`邮件发送失败: ${error.message}`, 'authService');
          throw new HttpException('验证码发送失败，请稍后重试', HttpStatus.INTERNAL_SERVER_ERROR);
        }
        await this.redisCacheService.set({ key, val: code }, 10 * 60); // 设置验证码600秒过期
        return `验证码发送成功、请填写验证码完成${isLogin ? '登录' : '注册'}！`;
      }
    } else if (isPhone) {
      const messageInfo = { phone, code };
      await this.verificationService.sendPhoneCode(messageInfo);
      await this.redisCacheService.set({ key, val: code }, 10 * 60);
      Logger.log(`发送验证码 | 手机号: ${phone}`, 'authService');
      return `验证码发送成功、请填写验证码完成${isLogin ? '登录' : '注册'}！`;
    }
  }

  /* 发送验证证码 */
  async sendPhoneCode(body: any) {
    const { phone, isLogin } = body;
    // const { id } = req.user;
    const code = createRandomCode();
    // 判断 contact 是邮箱还是手机号
    const isPhone = /^\d{10,}$/.test(phone); // 根据实际需求调整正则表达式
    Logger.debug(`发送手机验证码 | 手机号: ${phone}`);

    if (!isPhone) {
      throw new HttpException('请提供有效的手机号码。', HttpStatus.BAD_REQUEST);
    }

    // 仅在注册流程且指定登录标记时校验已存在用户
    if (isLogin === false) {
      const isAvailable = await this.userService.verifyUserRegister({
        phone,
      });
      if (!isAvailable) {
        throw new HttpException('当前手机号已注册，请勿重复注册！', HttpStatus.BAD_REQUEST);
      }
    }

    const nameSpace = await this.globalConfigService.getNamespace();
    const key = `${nameSpace}:CODE:${phone}`;

    // 检查Redis中是否已经有验证码且未过期
    const ttl = await this.redisCacheService.ttl(key);
    if (ttl && ttl > 0 && isPhone) {
      throw new HttpException(`${ttl}秒内不得重复发送验证码！`, HttpStatus.BAD_REQUEST);
    }

    const messageInfo = { phone, code };
    await this.redisCacheService.set({ key, val: code }, 10 * 60);
    await this.verificationService.sendPhoneCode(messageInfo);
    Logger.log(`发送验证码 | 手机号: ${phone}`, 'authService');

    return `验证码发送成功、请填写验证码完成${isLogin === false ? '注册' : '验证/登录'}！`;
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
        throw new HttpException('身份验证错误，请检查实名信息', HttpStatus.BAD_REQUEST);
      }
      // 保存用户的实名信息
      await this.userService.saveRealNameInfo(id, name, idCard);
      return '认证成功';
    } catch (error) {
      // 处理可能的错误并记录错误信息
      Logger.error('验证过程出现错误', error);
      throw new HttpException('认证失败，请检查相关信息', HttpStatus.BAD_REQUEST);
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
      throw new HttpException('验证码已过期，请重新发送！', HttpStatus.BAD_REQUEST);
    }

    if (code !== redisCode) {
      Logger.log(
        `验证码错误: ${phone} 输入的验证码: ${code}, 期望的验证码: ${redisCode}`,
        'authService',
      );
      throw new HttpException('验证码填写错误，请重新输入！', HttpStatus.BAD_REQUEST);
    }

    // 验证用户名是否已存在
    if (username) {
      const usernameTaken = await this.userService.isUsernameTaken(body.username, id);
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
      throw new HttpException('身份验证错误，请检查相关信息', HttpStatus.BAD_REQUEST);
    }
  }
}
