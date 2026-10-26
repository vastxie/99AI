import { createRandomNonceStr, maskSensitiveValue } from '@/common/utils';
import { maskToken, maskWechatId } from './log-mask';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import type {
  QrScene,
  QrSceneCreated,
  QrScenePollResult,
} from '@/modules/auth/providers/login-provider.types';
import { AuthIdentityService } from '@/modules/auth/identity/auth-identity.service';
import { WechatOfficialOAuthProvider } from './wechat-official-oauth.provider';
import { WechatOfficialTokenService } from './wechat-official-token.service';

import { GlobalConfigService } from '@/modules/globalConfig/globalConfig.service';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';

type WechatScenePayload = {
  scene: 'qr' | 'bind';
  userId?: number;
  createdAt: number;
};

/** 开发态（ISDEV）不访问微信时用来占位的二维码内容 */
const DEV_WECHAT_QR_URL =
  'https://work.weixin.qq.com/u/vc6d533423312e57e0?v=5.0.8.218278&bb=f0a3457f93';

type OfficialNotifyXmlObject = Record<string, unknown>;

type OfficialNotifyFields = {
  msgType: string | null;
  event: string | null;
  eventKey: string | null;
  content: string | null;
  fromUserName: string | null;
};

@Injectable()
export class OfficialService {
  private readonly sceneTtlSeconds = 5 * 60;

  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly authIdentityService: AuthIdentityService,
    private readonly wechatOfficialOAuth: WechatOfficialOAuthProvider,
    private readonly redisCacheService: RedisCacheService,
    private readonly wechatToken: WechatOfficialTokenService,
  ) {}

  /** 创建扫码登录 / 绑定场景并生成二维码；由内核 QrAuthService 经 WechatOfficialQrProvider 调用 */
  async createScene(scene: QrScene, userId?: number): Promise<QrSceneCreated> {
    const sceneStr = createRandomNonceStr(32);
    await this.setScene(sceneStr, {
      scene: scene === 'bind' ? 'bind' : 'qr',
      userId: scene === 'bind' ? Number(userId) : undefined,
      createdAt: Date.now(),
    });
    return {
      sceneId: sceneStr,
      qrUrl: await this.buildQrUrl(sceneStr),
      expiresIn: this.sceneTtlSeconds,
    };
  }

  /** 轮询扫码结果：登录场景给出用户 ID 由内核签发会话，绑定场景给出提示语 */
  async pollScene(sceneId: string, scene: QrScene, userId?: number): Promise<QrScenePollResult> {
    const stored = await this.getScene(sceneId);
    const expectedScene = scene === 'bind' ? 'bind' : 'qr';
    if (!stored || stored.scene !== expectedScene) {
      return { status: 'expired' };
    }
    if (scene === 'bind') {
      if (Number(stored.userId) !== Number(userId)) {
        throw new HttpException('非法参数', HttpStatus.BAD_REQUEST);
      }
      const result = await this.consumeScanResult(sceneId);
      if (!result) return { status: 'pending' };
      await this.clearScene(sceneId);
      Logger.log(
        `微信绑定确认 - UserID: ${userId}, SceneStr: ${maskSensitiveValue(sceneId)}`,
        'OfficialService',
      );
      return result.status
        ? { status: 'confirmed', message: result.msg }
        : { status: 'failed', message: result.msg || '绑定微信失败、请联系管理员！' };
    }
    const result = await this.consumeScanResult(sceneId);
    if (!result?.userId) return { status: 'pending' };
    await this.clearScene(sceneId);
    Logger.log(
      `扫码登录确认 - UserID: ${result.userId}, SceneStr: ${maskSensitiveValue(sceneId)}`,
      'OfficialService',
    );
    return { status: 'confirmed', userId: Number(result.userId) };
  }

  /** 二维码图片地址：开发态生成占位 data URL，否则向公众号申请临时二维码 ticket */
  private async buildQrUrl(sceneStr: string): Promise<string> {
    if (process.env.ISDEV === 'true') {
      Logger.log('开发环境下，生成测试二维码', 'OfficialService');
      try {
        return await QRCode.toDataURL(DEV_WECHAT_QR_URL, { width: 280, margin: 2 });
      } catch (error) {
        Logger.error(`开发环境二维码生成失败: ${error.message}`, 'OfficialService');
        return '';
      }
    }
    const ticket = await this.fetchQRCodeTicket(sceneStr);
    const mpUrl = await this.getWechatMpUrl();
    return `${mpUrl}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
  }

  /* 获取微信 MP URL 配置 */
  async getWechatMpUrl(): Promise<string> {
    return await this.wechatToken.getWechatUrl('mp');
  }

  async fetchQRCodeTicket(sceneStr: string) {
    Logger.log(
      `获取普通二维码ticket - sceneStr: ${maskSensitiveValue(sceneStr)}`,
      'OfficialService',
    );
    const accessToken = await this.wechatToken.getAccessToken();
    Logger.debug(
      `获取普通二维码 access_token 状态: ${accessToken ? '已配置' : '未配置'}`,
      'OfficialService',
    );

    const Url = await this.wechatToken.getWechatUrl('api');
    const params = {
      action_name: 'QR_STR_SCENE',
      action_info: { scene: { scene_str: sceneStr } },
    };

    Logger.debug('普通二维码请求参数已生成', 'OfficialService');
    const res = await axios.post(
      `${Url}/cgi-bin/qrcode/create?access_token=${accessToken}`,
      params,
    );

    Logger.debug(
      `普通二维码创建响应: errcode=${res.data?.errcode || 0}, errmsg=${res.data?.errmsg || ''}`,
      'OfficialService',
    );
    const {
      data: { errmsg, ticket },
    } = res;

    if (errmsg) {
      Logger.error(`获取普通二维码ticket失败: ${errmsg}`, 'OfficialService');
      throw new HttpException(errmsg, HttpStatus.BAD_REQUEST);
    }

    Logger.log(`普通二维码ticket获取成功: ${maskSensitiveValue(ticket)}`, 'OfficialService');
    return ticket;
  }

  /* 扫码事件 初次扫码关注 或者二次扫码都一样 */
  async scan(openID: string, sceneStr: string) {
    try {
      Logger.debug(
        `处理扫码事件 - OpenID: ${maskWechatId(openID)}, SceneStr: ${maskSensitiveValue(sceneStr)}`,
        'OfficialService',
      );

      const scene = await this.getScene(sceneStr);
      if (!scene || scene.scene !== 'qr') {
        Logger.error(
          `非法扫码请求 - 未找到的sceneStr: ${maskSensitiveValue(sceneStr)}`,
          'OfficialService',
        );
        throw new HttpException('非法参数', HttpStatus.BAD_REQUEST);
      }

      // 尝试获取用户完整信息（包括 UnionID，如果可用）
      const wechatUserInfo = await this.getUserInfoFromWechat(openID);
      const unionId = wechatUserInfo.unionid; // 可能是 null，没关系

      if (unionId) {
        Logger.log(
          `获取到 UnionID - OpenID: ${maskWechatId(openID)}, UnionID: ${maskWechatId(unionId)}`,
          'OfficialService',
        );
      } else {
        Logger.debug(
          `未获取到 UnionID（公众号可能未绑定开放平台）- OpenID: ${maskWechatId(openID)}`,
          'OfficialService',
        );
      }

      const identity = this.wechatOfficialOAuth.normalizeIdentity(wechatUserInfo, 'qr');
      const user = await this.authIdentityService.loginOrCreateByIdentity(identity);
      Logger.debug(
        `扫码用户信息 - OpenID: ${maskWechatId(openID)}, UserID: ${user?.id || '未找到'}`,
        'OfficialService',
      );

      // 记录扫描事件
      await this.setScanResult(sceneStr, { userId: user.id });
      Logger.debug(
        `更新扫码登录结果, SceneStr: ${maskSensitiveValue(sceneStr)}`,
        'OfficialService',
      );

      Logger.log(
        `用户扫码成功 - OpenID: ${maskWechatId(openID)}, UnionID: ${
          unionId ? maskWechatId(unionId) : '未绑定'
        }, UserID: ${user?.id || '未找到'}, SceneStr: ${maskSensitiveValue(sceneStr)}`,
        'OfficialService',
      );
    } catch (error) {
      Logger.error(
        `扫码处理失败 - OpenID: ${maskWechatId(openID)}, Error: ${error.message}`,
        'OfficialService',
      );
      throw new HttpException('处理扫码事件时发生错误', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /* 扫码事件 绑定微信 */
  async scanBindWx(openId: string, sceneStr: string) {
    Logger.debug(
      `处理绑定微信扫码 - OpenID: ${maskWechatId(openId)}, SceneStr: ${maskSensitiveValue(
        sceneStr,
      )}`,
      'OfficialService',
    );

    const scene = await this.getScene(sceneStr);
    if (!scene || scene.scene !== 'bind' || !scene.userId) {
      Logger.error(
        `非法参数 - sceneStr [${maskSensitiveValue(sceneStr)}] 不在有效扫码场景中`,
        'OfficialService',
      );
      throw new HttpException('非法参数', HttpStatus.BAD_REQUEST);
    }

    const userId = scene.userId;
    Logger.debug(`解析的UserID: ${userId}`, 'OfficialService');

    // 尝试获取用户完整信息（包括 UnionID，如果可用）
    const wechatUserInfo = await this.getUserInfoFromWechat(openId);
    const unionId = wechatUserInfo.unionid; // 可能是 null，没关系

    if (unionId) {
      Logger.log(
        `获取到 UnionID 用于绑定 - OpenID: ${maskWechatId(openId)}, UnionID: ${maskWechatId(
          unionId,
        )}`,
        'OfficialService',
      );
    } else {
      Logger.debug(
        `未获取到 UnionID（公众号可能未绑定开放平台）- OpenID: ${maskWechatId(openId)}`,
        'OfficialService',
      );
    }

    let bindRes;
    try {
      const identity = this.wechatOfficialOAuth.normalizeIdentity(wechatUserInfo, 'bind');
      await this.authIdentityService.bindIdentity(Number(userId), identity);
      bindRes = { status: true, msg: '恭喜您绑定成功、后续可直接扫码登录了！' };
    } catch (error) {
      bindRes = {
        status: false,
        msg: error?.message || '绑定微信失败、请联系管理员！',
      };
    }

    await this.setScanResult(sceneStr, bindRes);
    Logger.debug(
      `更新微信绑定扫码结果, SceneStr: ${maskSensitiveValue(sceneStr)}`,
      'OfficialService',
    );

    Logger.log(
      `微信绑定处理完成 - OpenID: ${maskWechatId(openId)}, UnionID: ${
        unionId ? maskWechatId(unionId) : '未绑定'
      }, UserID: ${userId}`,
      'OfficialService',
    );
    return bindRes;
  }

  async verify(signature: string, nonce: string, timestamp: string) {
    const token = (await this.globalConfigService.getConfigs(['wechatOfficialToken'])) || '';
    if (!token || !signature || !nonce || !timestamp) return false;
    const expected = this.sha1([token, nonce, timestamp].sort().join(''));
    return this.safeCompare(expected, signature);
  }

  async handleNotifyPostMessage(xmlData: unknown): Promise<string> {
    const xmlObject = this.normalizeNotifyXml(xmlData);
    if (!xmlObject) {
      Logger.warn('xmlData结构异常，缺少xml字段', 'OfficialService');
      return '';
    }

    Logger.debug('公众号XML对象已标准化', 'OfficialService');
    const fields = this.extractNotifyFields(xmlObject);

    Logger.debug(
      `提取的字段 - MsgType: ${fields.msgType}, Event: ${
        fields.event
      }, EventKey: ${maskSensitiveValue(fields.eventKey)}`,
      'OfficialService',
    );

    if (fields.msgType === 'event') {
      return this.handleNotifyEvent(fields);
    }

    if (fields.msgType === 'text') {
      Logger.log(
        `接收到文本消息: ${fields.content && fields.content.substring(0, 20)}${
          fields.content && fields.content.length > 20 ? '...' : ''
        }`,
        'OfficialService',
      );
      await this.sendConfigMessage(fields.fromUserName, 'officialAutoReplyText');
      return 'success';
    }

    Logger.debug(`未识别的消息类型: ${fields.msgType}, 返回默认响应`, 'OfficialService');
    return 'success';
  }

  private normalizeNotifyXml(xmlData: unknown): OfficialNotifyXmlObject | null {
    if (!xmlData || typeof xmlData !== 'object' || !('xml' in xmlData)) {
      return null;
    }

    let xmlObject = (xmlData as { xml?: unknown }).xml;

    if (Array.isArray(xmlObject)) {
      Logger.debug('XML解析为数组，取第一个元素', 'OfficialService');
      xmlObject = xmlObject[0];
    } else if (xmlObject && typeof xmlObject === 'object' && 'xml' in xmlObject) {
      const nestedXml = (xmlObject as { xml?: unknown }).xml;
      if (Array.isArray(nestedXml)) {
        Logger.debug('XML存在嵌套结构，使用内部xml数组的第一个元素', 'OfficialService');
        xmlObject = nestedXml[0];
      }
    }

    if (!xmlObject || typeof xmlObject !== 'object' || Array.isArray(xmlObject)) {
      return null;
    }

    return xmlObject as OfficialNotifyXmlObject;
  }

  private extractNotifyFields(xmlObject: OfficialNotifyXmlObject): OfficialNotifyFields {
    return {
      msgType:
        this.getNotifyXmlValue(xmlObject, 'MsgType') ||
        this.getNotifyXmlValue(xmlObject, 'msgtype'),
      event:
        this.getNotifyXmlValue(xmlObject, 'Event') || this.getNotifyXmlValue(xmlObject, 'event'),
      eventKey:
        this.getNotifyXmlValue(xmlObject, 'EventKey') ||
        this.getNotifyXmlValue(xmlObject, 'eventkey'),
      content:
        this.getNotifyXmlValue(xmlObject, 'Content') ||
        this.getNotifyXmlValue(xmlObject, 'content'),
      fromUserName:
        this.getNotifyXmlValue(xmlObject, 'FromUserName') ||
        this.getNotifyXmlValue(xmlObject, 'fromusername'),
    };
  }

  private getNotifyXmlValue(xmlObject: OfficialNotifyXmlObject, field: string): string | null {
    const value = xmlObject[field];
    if (value === undefined || value === null) return null;

    const normalizedValue = Array.isArray(value) ? value[0] : value;
    if (normalizedValue === undefined || normalizedValue === null) return null;

    return String(normalizedValue);
  }

  private async handleNotifyEvent(fields: OfficialNotifyFields): Promise<string> {
    Logger.log(`接收到事件类型消息: ${fields.event}`, 'OfficialService');

    if (fields.event === 'VIEW') {
      return '';
    }

    if (fields.event === 'CLICK') {
      Logger.log(
        `接收到菜单点击事件 - EventKey: ${maskSensitiveValue(fields.eventKey)}`,
        'OfficialService',
      );

      const menuContent = await this.getMenuContentByKey(fields.eventKey);

      if (menuContent) {
        await this.sendCustomerServiceMessage(fields.fromUserName, menuContent);
        Logger.log(`回复菜单内容 - Key: ${fields.eventKey}`, 'OfficialService');
      } else {
        Logger.warn(`菜单 ${fields.eventKey} 未配置回复内容`, 'OfficialService');
      }
      return 'success';
    }

    if (fields.event === 'SCAN') {
      Logger.log(
        `接收到扫码事件, SceneStr: ${maskSensitiveValue(fields.eventKey)}`,
        'OfficialService',
      );
      // 微信 SCAN 事件必带 EventKey；缺失时下游 getScene 查不到场景会按原逻辑拒绝，这里只做类型断言
      await this.handleNotifyScanScene(
        fields.fromUserName,
        fields.eventKey!,
        'officialScanLoginText',
      );
      return 'success';
    }

    if (fields.event === 'subscribe') {
      Logger.log(
        `接收到订阅事件, EventKey: ${maskSensitiveValue(fields.eventKey)}`,
        'OfficialService',
      );
      const sceneStr = fields.eventKey ? fields.eventKey.split('qrscene_')[1] : null;
      Logger.debug(`处理的sceneStr: ${maskSensitiveValue(sceneStr)}`, 'OfficialService');

      if (!sceneStr) {
        await this.sendConfigMessage(fields.fromUserName, 'officialSubscribeText');
        return 'success';
      }

      await this.handleNotifyScanScene(fields.fromUserName, sceneStr, 'officialSubscribeText');
      return 'success';
    }

    if (fields.event === 'unsubscribe') {
      Logger.log(`接收到取消订阅事件, 用户: ${fields.fromUserName}`, 'OfficialService');
      return '';
    }

    Logger.debug(`未识别的事件类型: ${fields.event}, 返回默认响应`, 'OfficialService');
    return 'success';
  }

  private async handleNotifyScanScene(
    fromUserName: string | null,
    sceneStr: string,
    successMessageKey: string,
  ) {
    // 微信推送必带 FromUserName；缺失时 scan / scanBindWx 会按原逻辑在拉取用户信息处失败，这里只做类型断言
    if (await this.isBindScene(sceneStr)) {
      const bindResult = await this.scanBindWx(fromUserName!, sceneStr);
      const configKey = bindResult.status
        ? 'officialBindAccountText'
        : 'officialBindAccountFailText';
      await this.sendConfigMessage(fromUserName, configKey);
      return;
    }

    await this.scan(fromUserName!, sceneStr);
    await this.sendConfigMessage(fromUserName, successMessageKey);
  }

  sha1(data: string) {
    return crypto.createHash('sha1').update(data).digest('hex');
  }

  private safeCompare(expected: string, actual: string) {
    if (typeof expected !== 'string' || typeof actual !== 'string') return false;
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }

  /* 通过 OpenID 获取用户完整信息（包括 UnionID，如果可用） */
  async getUserInfoFromWechat(openId: string) {
    try {
      const accessToken = await this.wechatToken.getAccessToken();
      const Url = await this.wechatToken.getWechatUrl('api');

      Logger.debug(`调用微信用户信息接口 - OpenID: ${maskWechatId(openId)}`, 'OfficialService');

      const res = await axios.get(
        `${Url}/cgi-bin/user/info?access_token=${accessToken}&openid=${encodeURIComponent(
          openId,
        )}&lang=zh_CN`,
      );

      const { data } = res;

      // 检查是否有错误
      if (data.errcode) {
        Logger.error(
          `获取用户信息失败 - 错误码: ${data.errcode}, 错误信息: ${data.errmsg}`,
          'OfficialService',
        );
        throw new HttpException(data.errmsg, HttpStatus.BAD_REQUEST);
      }

      // unionid 可能不存在（未绑定开放平台时）
      const unionid = data.unionid || null;

      if (unionid) {
        Logger.log(
          `获取用户信息成功 - OpenID: ${maskWechatId(openId)}, UnionID: ${maskWechatId(unionid)}`,
          'OfficialService',
        );
      } else {
        Logger.debug(
          `获取用户信息成功 - OpenID: ${maskWechatId(openId)}, UnionID: 未绑定开放平台`,
          'OfficialService',
        );
      }

      return {
        openid: data.openid,
        unionid: unionid, // 如果未绑定开放平台，这里是 null，不会报错
        nickname: data.nickname || '',
        city: data.city || '',
        province: data.province || '',
        country: data.country || '',
        headimgurl: data.headimgurl || '',
        subscribe: data.subscribe || 0,
        subscribe_time: data.subscribe_time || 0,
      };
    } catch (error) {
      Logger.error(`获取用户信息异常: ${error.message}`, 'OfficialService');
      throw new HttpException('获取微信用户信息失败', HttpStatus.BAD_REQUEST);
    }
  }

  async isBindScene(sceneStr: string): Promise<boolean> {
    const scene = await this.getScene(sceneStr);
    return scene?.scene === 'bind';
  }

  private getSceneKey(sceneStr: string) {
    return `auth:wechat-official:scene:${sceneStr}`;
  }

  private getScanKey(sceneStr: string) {
    return `auth:wechat-official:scan:${sceneStr}`;
  }

  private async setScene(sceneStr: string, payload: WechatScenePayload) {
    await this.redisCacheService.set(
      { key: this.getSceneKey(sceneStr), val: JSON.stringify(payload) },
      this.sceneTtlSeconds,
    );
  }

  private async getScene(sceneStr: string): Promise<WechatScenePayload | null> {
    const payloadText = await this.redisCacheService.get({ key: this.getSceneKey(sceneStr) });
    if (!payloadText) return null;
    try {
      return JSON.parse(payloadText);
    } catch {
      return null;
    }
  }

  private async clearScene(sceneStr: string) {
    await this.redisCacheService.del({ key: this.getSceneKey(sceneStr) });
  }

  private async setScanResult(sceneStr: string, payload: Record<string, any>) {
    await this.redisCacheService.set(
      { key: this.getScanKey(sceneStr), val: JSON.stringify(payload) },
      this.sceneTtlSeconds,
    );
  }

  private async consumeScanResult(sceneStr: string): Promise<Record<string, any> | null> {
    const payloadText = await this.redisCacheService.getDel({ key: this.getScanKey(sceneStr) });
    if (!payloadText) return null;
    try {
      return JSON.parse(payloadText);
    } catch {
      return null;
    }
  }

  /* 通过客服消息 API 主动发送消息（不依赖被动回复，支持转发服务场景） */
  async sendCustomerServiceMessage(openId: string | null, content: string) {
    try {
      if (!content) return;
      const accessToken = await this.wechatToken.getAccessToken();
      const Url = await this.wechatToken.getWechatUrl('api');
      const res = await axios.post(
        `${Url}/cgi-bin/message/custom/send?access_token=${accessToken}`,
        {
          touser: openId,
          msgtype: 'text',
          text: { content },
        },
      );
      if (res.data?.errcode && res.data.errcode !== 0) {
        Logger.error(`客服消息发送失败: ${res.data.errmsg}`, 'OfficialService');
        return;
      }
      Logger.log(`客服消息发送成功 - OpenID: ${maskWechatId(openId)}`, 'OfficialService');
    } catch (error) {
      Logger.error(`客服消息发送异常: ${error.message}`, 'OfficialService');
    }
  }

  /* 读取配置并发送客服消息 */
  async sendConfigMessage(openId: string | null, msgKey: string) {
    const content = await this.globalConfigService.getConfigs([msgKey]);
    Logger.debug(`使用配置消息 [${msgKey}]`, 'OfficialService');
    await this.sendCustomerServiceMessage(openId, content);
  }

  genXmlMsg(xmlData: Record<string, string | string[]>, msg: string): Promise<string> {
    return Promise.resolve().then(() => {
      // 辅助函数，安全地获取字段值
      const getXmlValue = (field: string) => {
        const fieldLower = field.toLowerCase();
        // 尝试通过原始字段名获取
        if (xmlData[field] !== undefined) {
          return Array.isArray(xmlData[field]) ? xmlData[field][0] : xmlData[field];
        }
        // 尝试通过小写字段名获取
        if (xmlData[fieldLower] !== undefined) {
          return Array.isArray(xmlData[fieldLower]) ? xmlData[fieldLower][0] : xmlData[fieldLower];
        }
        return null;
      };

      const fromUser = getXmlValue('FromUserName') || getXmlValue('fromusername');
      const toUser = getXmlValue('ToUserName') || getXmlValue('tousername');

      Logger.debug(`生成XML回复, 发送给: ${fromUser}, 来自: ${toUser}`, 'OfficialService');

      // 检查必要字段是否存在
      if (!fromUser) {
        Logger.error('缺少FromUserName字段', 'OfficialService');
        throw new HttpException('缺少必要的XML字段', HttpStatus.BAD_REQUEST);
      }

      if (!toUser) {
        Logger.error('缺少ToUserName字段', 'OfficialService');
        throw new HttpException('缺少必要的XML字段', HttpStatus.BAD_REQUEST);
      }

      const xmlResponse = `
    <xml>
        <ToUserName><![CDATA[${fromUser}]]></ToUserName>
        <FromUserName><![CDATA[${toUser}]]></FromUserName>
        <CreateTime>${new Date().getTime()}</CreateTime>
        <MsgType><![CDATA[text]]></MsgType>
        <Content><![CDATA[${msg}]]></Content>
    </xml>`;

      Logger.debug(`生成的XML回复已完成`, 'OfficialService');
      return xmlResponse;
    });
  }

  /* 创建自定义菜单 */
  async createMenu(menuData: any) {
    try {
      const accessToken = await this.wechatToken.getAccessToken();
      const Url = await this.wechatToken.getWechatUrl('api');

      // 打印详细的菜单数据用于调试
      Logger.log(`准备创建菜单 - 菜单数量: ${menuData.button?.length || 0}`, 'OfficialService');

      // 保存菜单配置到数据库，包括 content 字段
      await this.saveMenuConfig(menuData);

      const res = await axios.post(
        `${Url}/cgi-bin/menu/create?access_token=${accessToken}`,
        menuData,
      );
      const { data } = res;

      // 检查微信返回的错误码
      if (data.errcode && data.errcode !== 0) {
        Logger.error(
          `微信API返回错误 - 错误码: ${data.errcode}, 错误信息: ${data.errmsg}`,
          'OfficialService',
        );
        throw new HttpException(data.errmsg || '创建菜单失败', HttpStatus.BAD_REQUEST);
      }

      Logger.log(`创建自定义菜单成功`, 'OfficialService');
      return data;
    } catch (error) {
      Logger.error(`创建自定义菜单失败: ${error.message}`, 'OfficialService');
      // 如果有微信返回的详细错误，一起打印
      if (error.response?.data) {
        Logger.error(`微信API错误详情: ${JSON.stringify(error.response.data)}`, 'OfficialService');
      }
      throw new HttpException(
        error.response?.data?.errmsg || '创建自定义菜单失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 保存菜单配置到数据库 */
  private async saveMenuConfig(menuData: any) {
    try {
      // 将完整的菜单配置保存到配置表
      await this.globalConfigService.setConfig({
        settings: [
          {
            configKey: 'wechatMenuConfig',
            configVal: JSON.stringify(menuData),
          },
        ],
      });
      Logger.log('菜单配置已保存到数据库', 'OfficialService');
    } catch (error) {
      Logger.error(`保存菜单配置失败: ${error.message}`, 'OfficialService');
      // 不抛出异常，避免影响菜单创建流程
    }
  }

  /* 根据菜单key获取回复内容 */
  async getMenuContentByKey(key: string | null): Promise<string | null> {
    try {
      const menuConfigStr = await this.globalConfigService.getConfigs(['wechatMenuConfig']);
      if (!menuConfigStr) {
        Logger.warn('未找到菜单配置', 'OfficialService');
        return null;
      }

      const menuConfig = JSON.parse(menuConfigStr);
      if (!menuConfig.button || !Array.isArray(menuConfig.button)) {
        return null;
      }

      // 在一级菜单中查找
      for (const menu of menuConfig.button) {
        if (menu.key === key && menu.content) {
          Logger.debug(`找到菜单回复内容 - key: ${key}`, 'OfficialService');
          return menu.content;
        }

        // 在子菜单中查找
        if (menu.sub_button && Array.isArray(menu.sub_button)) {
          for (const subMenu of menu.sub_button) {
            if (subMenu.key === key && subMenu.content) {
              Logger.debug(`找到子菜单回复内容 - key: ${key}`, 'OfficialService');
              return subMenu.content;
            }
          }
        }
      }

      Logger.warn(`未找到key为 ${key} 的菜单配置`, 'OfficialService');
      return null;
    } catch (error) {
      Logger.error(`获取菜单回复内容失败: ${error.message}`, 'OfficialService');
      return null;
    }
  }

  /* 查询自定义菜单 */
  async getMenu() {
    try {
      Logger.log('开始查询自定义菜单', 'OfficialService');

      // 优先从数据库读取保存的完整配置（包含 content 字段）
      const menuConfigStr = await this.globalConfigService.getConfigs(['wechatMenuConfig']);

      if (menuConfigStr) {
        try {
          const menuConfig = JSON.parse(menuConfigStr);
          Logger.log('从数据库读取菜单配置成功', 'OfficialService');
          Logger.debug(`数据库菜单配置: ${JSON.stringify(menuConfig)}`, 'OfficialService');

          // 返回包含 content 字段的完整配置
          return {
            menu: menuConfig,
          };
        } catch (parseError) {
          Logger.warn(`解析数据库菜单配置失败: ${parseError.message}`, 'OfficialService');
          // 解析失败，继续从微信API获取
        }
      } else {
        Logger.debug('数据库中未找到菜单配置，尝试从微信API获取', 'OfficialService');
      }

      // 如果数据库没有配置，则从微信API获取
      const accessToken = await this.wechatToken.getAccessToken();
      const Url = await this.wechatToken.getWechatUrl('api');
      const res = await axios.get(`${Url}/cgi-bin/menu/get?access_token=${accessToken}`);
      const { data } = res;

      // 检查微信返回的错误码
      if (data.errcode && data.errcode !== 0) {
        // 检查是否是 dev 模式下 access_token 相关错误
        const isDevMode =
          process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
        const isAccessTokenError = data.errcode === 41001 || data.errmsg?.includes('access_token');

        if (isDevMode && isAccessTokenError) {
          Logger.debug(
            `开发模式下未配置微信 access_token (错误码: ${data.errcode})，返回空菜单配置`,
            'OfficialService',
          );
          return { menu: { button: [] } };
        }

        Logger.error(
          `查询菜单失败 - 错误码: ${data.errcode}, 错误信息: ${data.errmsg}`,
          'OfficialService',
        );
        throw new HttpException(data.errmsg || '查询菜单失败', HttpStatus.BAD_REQUEST);
      }

      Logger.log(`从微信API查询自定义菜单成功`, 'OfficialService');
      Logger.debug(`微信API菜单数据: ${JSON.stringify(data)}`, 'OfficialService');

      // 如果没有菜单，返回空结构
      if (!data.menu || !data.menu.button) {
        Logger.warn('当前公众号未配置自定义菜单', 'OfficialService');
        return { menu: { button: [] } };
      }

      return data;
    } catch (error) {
      // 检查是否是 dev 模式下 access_token 相关错误
      const isDevMode =
        process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
      const isAccessTokenError =
        error.message?.includes('access_token') ||
        error.message?.includes('41001') ||
        error.response?.data?.errcode === 41001;

      if (isDevMode && isAccessTokenError) {
        Logger.debug('开发模式下未配置微信 access_token，返回空菜单配置', 'OfficialService');
        return { menu: { button: [] } };
      }

      Logger.error(`查询自定义菜单失败: ${error.message}`, 'OfficialService');
      if (error.response?.data) {
        Logger.error(`微信API错误详情: ${JSON.stringify(error.response.data)}`, 'OfficialService');
      }
      throw new HttpException(
        error.response?.data?.errmsg || '查询自定义菜单失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 删除自定义菜单 */
  async deleteMenu() {
    try {
      const accessToken = await this.wechatToken.getAccessToken();
      const Url = await this.wechatToken.getWechatUrl('api');
      const res = await axios.get(`${Url}/cgi-bin/menu/delete?access_token=${accessToken}`);
      const { data } = res;

      // 同时清除数据库中保存的菜单配置
      try {
        await this.globalConfigService.setConfig({
          settings: [
            {
              configKey: 'wechatMenuConfig',
              configVal: '',
            },
          ],
        });
        Logger.log('已清除数据库中的菜单配置', 'OfficialService');
      } catch (clearError) {
        Logger.warn(`清除数据库菜单配置失败: ${clearError.message}`, 'OfficialService');
        // 不抛出异常，避免影响主流程
      }

      Logger.log(`删除自定义菜单成功`, 'OfficialService');
      return data;
    } catch (error) {
      Logger.error(`删除自定义菜单失败: ${error.message}`, 'OfficialService');
      throw new HttpException(
        error.response?.data?.errmsg || '删除自定义菜单失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* ==================== 素材管理接口 ==================== */

  /* 获取素材列表 */
  async getMaterialList(type: string, offset = 0, count = 20) {
    try {
      Logger.log(
        `获取素材列表 - 类型: ${type}, offset: ${offset}, count: ${count}`,
        'OfficialService',
      );

      const accessToken = await this.wechatToken.getAccessToken();
      const Url = await this.wechatToken.getWechatUrl('api');

      // 详细记录请求信息
      const requestUrl = `${Url}/cgi-bin/material/batchget_material?access_token=${maskToken(
        accessToken,
      )}`;
      const requestBody = { type, offset, count };

      Logger.log(`请求URL: ${requestUrl}`, 'OfficialService');
      Logger.log(`请求参数: ${JSON.stringify(requestBody)}`, 'OfficialService');
      Logger.debug(`Access Token 状态: ${accessToken ? '已配置' : '未配置'}`, 'OfficialService');

      const res = await axios.post(
        `${Url}/cgi-bin/material/batchget_material?access_token=${accessToken}`,
        requestBody,
      );

      const { data } = res;

      // 详细记录响应信息
      Logger.log(`响应状态码: ${res.status}`, 'OfficialService');
      // 不打印完整响应数据（含 media_id/URL 等敏感字段）

      // 检查错误码
      if (data.errcode !== undefined && data.errcode !== 0) {
        Logger.error(
          `微信API返回错误 - 错误码: ${data.errcode}, 错误信息: ${data.errmsg}`,
          'OfficialService',
        );
        throw new HttpException(
          `微信API错误(${data.errcode}): ${data.errmsg}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // 详细记录返回数据结构
      Logger.log(`返回数据结构分析:`, 'OfficialService');
      Logger.log(`- total_count: ${data.total_count}`, 'OfficialService');
      Logger.log(`- item_count: ${data.item_count}`, 'OfficialService');
      Logger.log(`- item数组长度: ${data.item?.length || 0}`, 'OfficialService');

      // 不打印素材示例（含 media_id/URL 等敏感字段）

      Logger.log(
        `获取素材列表成功 - 总数: ${data.total_count}, 返回: ${data.item_count}`,
        'OfficialService',
      );

      // 如果返回为空，记录提示信息
      if (data.total_count === 0 || data.item_count === 0) {
        Logger.warn(
          `当前公众号暂无${type}类型的素材，请检查：1) 公众号是否真的有素材 2) access_token是否正确`,
          'OfficialService',
        );
      }

      return data;
    } catch (error) {
      Logger.error(`获取素材列表异常: ${error.message}`, 'OfficialService');
      Logger.error(`错误堆栈: ${error.stack}`, 'OfficialService');

      if (error.response) {
        Logger.error(`HTTP响应状态: ${error.response.status}`, 'OfficialService');
        Logger.error(`HTTP响应数据: ${JSON.stringify(error.response.data)}`, 'OfficialService');
      }

      throw new HttpException(
        error.response?.data?.errmsg || error.message || '获取素材列表失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
