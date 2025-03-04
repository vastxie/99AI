import { formatUrl, hideString } from '@/common/utils';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Request } from 'express';
import * as fs from 'fs';
import { In, Repository } from 'typeorm';
import { ChatLogEntity } from './../chatLog/chatLog.entity';
import { ModelsService } from './../models/models.service';
import { ConfigEntity } from './config.entity';
import { QueryConfigDto } from './dto/queryConfig.dto';
import { SetConfigDto } from './dto/setConfig.dto';
const packageJsonContent = fs.readFileSync('package.json', 'utf-8');
const packageJson = JSON.parse(packageJsonContent);
const version = packageJson.version;
console.log(' current use version in ------>: ', version);

@Injectable()
export class GlobalConfigService implements OnModuleInit {
  constructor(
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @InjectRepository(ChatLogEntity)
    private readonly chatLogEntity: Repository<ChatLogEntity>,
    private readonly modelsService: ModelsService
  ) {}
  private globalConfigs: any = {};
  private wechatAccessToken: string;
  private wechatJsapiTicket: string;

  async onModuleInit() {
    await this.initGetAllConfig();
  }

  /* 对外提供给其他service  */
  async getConfigs(configKey: string[]) {
    if (configKey.length === 0) return;
    /* 微信token特殊处理 */
    if (configKey.includes('wechatAccessToken') && configKey.length === 1) {
      return this.wechatAccessToken;
    }
    if (configKey.includes('wechatJsapiTicket') && configKey.length === 1) {
      return this.wechatJsapiTicket;
    }
    if (configKey.length === 1) {
      return this.globalConfigs[configKey[0]];
    } else {
      const result = {};
      configKey.forEach((key) => (result[key] = this.globalConfigs[key]));
      return result;
    }
  }

  /* 初始化查询所有config 不对外调用 */
  async initGetAllConfig() {
    const data = await this.configEntity.find();
    this.globalConfigs = data.reduce((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});
    this.initBaiduSensitive();
  }

  /* 初始化百度敏感词 拿到百度的access_token isInit: 初始化报错不检测  管理端手动修改则提示 */
  async initBaiduSensitive(isInit = true) {
    const { baiduTextApiKey, baiduTextSecretKey } = await this.getConfigs([
      'baiduTextApiKey',
      'baiduTextSecretKey',
    ]);
    if (!baiduTextApiKey || !baiduTextSecretKey) {
      // Logger.error('百度敏感词初始化失败，如果需要敏感检测、请前往后台系统配置!', 'GlobalConfigService');
      return;
    }
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const url = `https://aip.baidubce.com/oauth/2.0/token?client_id=${baiduTextApiKey}&client_secret=${baiduTextSecretKey}&grant_type=client_credentials`;
    try {
      const response = await axios.post(url, { headers });
      this.globalConfigs.baiduTextAccessToken = response.data.access_token;
    } catch (error) {
      if (isInit) {
        // Logger.error('百度敏感词配置检测失败，您的参数可能配置的不正确!', 'GlobalConfigService');
      } else {
        throw new HttpException(
          error.response.data.error_description,
          HttpStatus.BAD_REQUEST
        );
      }
    }
  }

  /* 定时刷新 access_token */
  async getWechatAccessToken(isInit = false) {
    const { wechatOfficialAppId: appId, wechatOfficialAppSecret: secret } =
      await this.getConfigs(['wechatOfficialAppId', 'wechatOfficialAppSecret']);
    if (!appId || !secret) {
      return Logger.error(
        '还未配置微信的appId和secret、配置后才可进行微信扫码登录！！！',
        'OfficialService'
      );
    }
    this.wechatAccessToken = await this.fetchBaseAccessToken(
      appId,
      secret,
      isInit
    );
    this.wechatJsapiTicket = await this.fetchJsapiTicket(
      this.wechatAccessToken
    );
    Logger.log(
      `wechat refresh access_token  ==> ${this.wechatAccessToken}`,
      'OfficialService'
    );
  }

  /* 获取微信access_token */
  async fetchBaseAccessToken(appId: string, secret: string, isInit = false) {
    if (process.env.ISDEV === 'TRUE') {
      this.wechatAccessToken = '';
      return;
    }
    const Url = formatUrl(
      process.env.weChatApiUrl || 'https://api.weixin.qq.com'
    );
    const {
      data: { errmsg, access_token },
    } = await axios.get(
      `${Url}/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`
    );
    if (errmsg) {
      if (isInit) {
        Logger.error(
          `获取微信access_token失败、错误信息：${errmsg}`,
          'OfficialService'
        );
      }
      return '';
    }
    return access_token;
  }

  /* 获取微信jsapi_ticket */
  async fetchJsapiTicket(accessToken: string) {
    if (process.env.ISDEV === 'TRUE') {
      this.wechatJsapiTicket = '';
      return;
    }
    const Url = formatUrl(
      process.env.weChatApiUrl || 'https://api.weixin.qq.com'
    );
    const res = await axios.get(
      `${Url}/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`
    );
    return res?.data?.ticket;
  }

  /* 查询所有配置信息 */
  async queryAllConfig(req: Request) {
    const { role } = req.user;
    return this.globalConfigs;
  }

  /* 前端网站的所有查阅权限的配置信息 */
  async queryFrontConfig(query, req) {
    /* 指定前端可以访问范围 */
    const allowKeys = [
      'registerSendStatus',
      'registerSendModel3Count',
      'registerSendModel4Count',
      'registerSendDrawMjCount',
      'firstRegisterSendStatus',
      'firstRegisterSendRank',
      'firstRregisterSendModel3Count',
      'firstRregisterSendModel4Count',
      'firstRregisterSendDrawMjCount',
      'clientHomePath',
      'clientLogoPath',
      'clientFavoIconPath',
      'drawingStyles',
      'isUseWxLogin',
      'siteName',
      'robotAvatar',
      'siteRobotName',
      'buyCramiAddress',
      'mindDefaultData',
      'baiduCode',
      'payEpayChannel',
      'payMpayChannel',
      'payEpayApiPayUrl',
      'payEpayStatus',
      'payHupiStatus',
      'payWechatStatus',
      'payMpayStatus',
      'payLtzfStatus',
      'isAutoOpenNotice',
      'isShowAppCatIcon',
      'salesBaseRatio',
      'salesSeniorRatio',
      'salesAllowDrawMoney',
      'companyName',
      'filingNumber',
      'emailLoginStatus',
      'phoneLoginStatus',
      'wechatRegisterStatus',
      'wechatSilentLoginStatus',
      'signInStatus',
      'signInModel3Count',
      'signInModel4Count',
      'signInMjDrawToken',
      'appMenuHeaderTips',
      'pluginFirst',
      'mjUseBaiduFy',
      'mjHideNotBlock',
      'mjHideWorkIn',
      'isVerifyEmail',
      'showWatermark',
      'isHideTts',
      'isHideDefaultPreset',
      'isHideModel3Point',
      'isHideModel4Point',
      'isHideDrawMjPoint',
      'isHidePlugin',
      'model3Name',
      'model4Name',
      'drawMjName',
      'isModelInherited',
      'noVerifyRegister',
      'noticeInfo',
      'homeHtml',
      'isAutoOpenAgreement',
      'agreementInfo',
      'agreementTitle',
    ];
    const data = await this.configEntity.find({
      where: { configKey: In(allowKeys) },
    });
    const { domain } = query;
    const domainDb = this.globalConfigs['domain'];
    if (domainDb !== domain) {
      this.createOrUpdate({
        configKey: `domain`,
        configVal: domain,
        status: 1,
      });
      await this.initGetAllConfig();
    }
    const publicConfig = data.reduce((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});
    /* 追加一些自定义的配置 */
    const { wechatOfficialAppId, wechatOfficialAppSecret } =
      await this.getConfigs(['wechatOfficialAppId', 'wechatOfficialAppSecret']);
    const isUseWxLogin = !!(wechatOfficialAppId && wechatOfficialAppSecret);

    /* 查看是否有本机未同步数据 */
    return { ...publicConfig, isUseWxLogin };
  }

  /* 查询配置 */
  async queryConfig(body: QueryConfigDto, req: Request) {
    const { role } = req.user;
    const { keys } = body;
    const data = await this.configEntity.find({
      where: { configKey: In(keys) },
    });
    /* 对演示账户的一些敏感配置修改处理 */
    if (role !== 'super') {
      // data = data.filter((t) => !t.configKey.includes('Key'));
      data.forEach((item) => {
        if (
          item.configKey.includes('mj') ||
          item.configKey.includes('Key') ||
          item.configKey.includes('gpt') ||
          item.configKey.includes('cos') ||
          item.configKey.includes('baidu') ||
          item.configKey.includes('ali') ||
          item.configKey.includes('tencent') ||
          item.configKey.includes('pay') ||
          item.configKey.includes('wechat') ||
          item.configKey.includes('mjProxyImgUrl') ||
          item.configKey === 'openaiBaseUrl'
        ) {
          /* 比较长的隐藏内容自定义 */
          const longKeys = ['payWeChatPublicKey', 'payWeChatPrivateKey'];
          if (longKeys.includes(item.configKey)) {
            return (item.configVal = hideString(
              item.configVal,
              '隐私内容、非超级管理员无权查看'
            ));
          }
          const whiteListKey = [
            'payEpayStatus',
            'payHupiStatus',
            'mjProxy',
            'payLtzfStatus',
          ];
          if (
            !whiteListKey.includes(item.configKey) &&
            !item.configKey.includes('Status')
          ) {
            item.configVal = hideString(item.configVal);
          }
        }
      });
    }

    return data.reduce((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});
  }

  /* 设置配置信息 */
  async setConfig(body: SetConfigDto) {
    try {
      const { settings } = body;
      for (const item of settings) {
        await this.createOrUpdate(item);
      }
      await this.initGetAllConfig();
      const keys = settings.map((t) => t.configKey);
      /* 如果修改的包含了百度云文本检测选择、则需要触发更新重新获取token */
      if (
        keys.includes('baiduTextApiKey') ||
        keys.includes('baiduTextSecretKey')
      ) {
        await this.initBaiduSensitive(false);
      }
      /* 如果变更微信配置 则需要手动刷新微信 access_token */
      if (
        keys.includes('wechatOfficialAppId') ||
        keys.includes('wechatOfficialAppSecret')
      ) {
        await this.getWechatAccessToken();
      }

      return '设置完成！';
    } catch (error) {
      console.log('error: ', error);
    }
  }

  /* 创建或更新配置信息 */
  async createOrUpdate(setting) {
    /* 后期追加配置非自动化的需要手动追加为public让前端查找 */
    try {
      const { configKey, configVal, status = 1 } = setting;
      const c = await this.configEntity.findOne({ where: { configKey } });
      if (c) {
        const res = await this.configEntity.update(
          { configKey },
          { configVal, status }
        );
      } else {
        const save = await this.configEntity.save({
          configKey,
          configVal,
          status,
        });
      }
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException('设置配置信息错误！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询公告信息 */
  async queryNotice() {
    return await this.getConfigs(['noticeInfo', 'noticeTitle']);
  }

  /* 开启多个支付规则的时候 按顺序只使用一个 */
  async queryPayType() {
    const {
      payHupiStatus = 0,
      payEpayStatus = 0,
      payWechatStatus = 0,
      payMpayStatus = 0,
      payLtzfStatus = 0,
    } = await this.getConfigs([
      'payHupiStatus',
      'payEpayStatus',
      'payMpayStatus',
      'payWechatStatus',
      'payLtzfStatus',
    ]);
    if (
      [
        payHupiStatus,
        payEpayStatus,
        payWechatStatus,
        payMpayStatus,
        payLtzfStatus,
      ].every((status) => status === 0)
    ) {
      throw new HttpException('支付功能暂未开放!', HttpStatus.BAD_REQUEST);
    }
    if (Number(payWechatStatus) === 1) {
      return 'wechat';
    }
    if (Number(payEpayStatus) === 1) {
      return 'epay';
    }
    if (Number(payMpayStatus) === 1) {
      return 'mpay';
    }
    if (Number(payHupiStatus) === 1) {
      return 'hupi';
    }
    if (Number(payLtzfStatus) === 1) {
      return 'ltzf';
    }
  }

  /* get auth info */
  async getAuthInfo() {
    const { siteName, registerBaseUrl, domain } = await this.getConfigs([
      'siteName',
      'registerBaseUrl',
      'domain',
    ]);
    return { siteName, registerBaseUrl, domain };
  }

  /* get phone verify config */
  async getPhoneVerifyConfig() {
    const {
      phoneLoginStatus,
      aliPhoneAccessKeyId,
      aliPhoneAccessKeySecret,
      aliPhoneSignName,
      aliPhoneTemplateCode,
    } = await this.getConfigs([
      'phoneLoginStatus',
      'aliPhoneAccessKeyId',
      'aliPhoneAccessKeySecret',
      'aliPhoneSignName',
      'aliPhoneTemplateCode',
    ]);
    if (Number(phoneLoginStatus) !== 1) {
      throw new HttpException(
        '手机验证码功能暂未开放!',
        HttpStatus.BAD_REQUEST
      );
    }
    return {
      accessKeyId: aliPhoneAccessKeyId,
      accessKeySecret: aliPhoneAccessKeySecret,
      SignName: aliPhoneSignName,
      TemplateCode: aliPhoneTemplateCode,
    };
  }

  /* get namespace */
  getNamespace() {
    return process.env.NAMESPACE || 'AIWeb';
  }

  /* 获取签名赠送额度 */
  async getSignatureGiftConfig() {
    const {
      signInStatus = 0,
      signInModel3Count = 0,
      signInModel4Count = 0,
      signInMjDrawToken = 0,
    } = await this.getConfigs([
      'signInStatus',
      'signInModel3Count',
      'signInModel4Count',
      'signInMjDrawToken',
    ]);
    if (Number(signInStatus) !== 1) {
      throw new HttpException('签到功能暂未开放!', HttpStatus.BAD_REQUEST);
    }
    return {
      model3Count: Number(signInModel3Count),
      model4Count: Number(signInModel4Count),
      drawMjCount: Number(signInMjDrawToken),
    };
  }

  async auth() {
    const api = '';
    const response = await fetch(api, {});
    const responseData: any = await response.json();
    const { success = true, message } = responseData;

    Logger.debug('感谢您使用AIWeb，祝您使用愉快~');
  }

  /* 拿到敏感次配置 都开启优先使用百度云 */
  async getSensitiveConfig() {
    const { baiduTextStatus = 0, baiduTextAccessToken } = await this.getConfigs(
      ['baiduTextStatus', 'baiduTextAccessToken']
    );
    if (Number(baiduTextStatus) === 1) {
      return {
        useType: 'baidu',
        baiduTextAccessToken,
      };
    }
    return null;
  }
}
