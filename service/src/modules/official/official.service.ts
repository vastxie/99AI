import { createRandomNonceStr, formatUrl } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { AutoReplyService } from '../autoReply/autoReply.service';
import { ChatService } from '../chat/chat.service';
import { AuthService } from './../auth/auth.service';
import { GlobalConfigService } from './../globalConfig/globalConfig.service';
import { UserService } from './../user/user.service';

@Injectable()
export class OfficialService {
  constructor(
    private readonly autoReplyService: AutoReplyService,
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly chatgptService: ChatService,
  ) {}
  private sceneStrMap = {};
  private scanedSceneStrMap = {};

  async onModuleInit() {
    await this.globalConfigService.getWechatAccessToken(true);
    await this.globalConfigService.getOldWechatAccessToken(true);
  }

  async getQRSceneStr() {
    const sceneStr = createRandomNonceStr(32);
    this.sceneStrMap[sceneStr] = true;
    return sceneStr;
  }

  /* 下发绑定微信的sceneStr */
  async getQRSceneStrByBind(req) {
    const { id } = req.user;
    const sceneStr = `${createRandomNonceStr(32)}/${id}`;
    this.sceneStrMap[sceneStr] = true;
    return sceneStr;
  }

  async getQRCodeTicket(sceneStr: string) {
    Logger.log(`开始获取普通二维码ticket，sceneStr: ${sceneStr}`, 'OfficialService');
    return this.fetchQRCodeTicket(sceneStr);
  }

  async getRedirectUrl(url: string) {
    const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
    const Url = formatUrl(process.env.weChatOpenUrl || 'https://open.weixin.qq.com');
    const res = `${Url}/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodeURIComponent(
      url,
    )}&response_type=code&scope=snsapi_userinfo&state=weChatLogin#wechat_redirect`;
    Logger.debug(`生成微信授权跳转URL: ${res}`);
    return res;
  }

  async getJsapiTicket(url: string) {
    const nonceStr = createRandomNonceStr(32);
    const timestamp = (Date.now() / 1000).toFixed(0);
    const jsapiTicket = await this.globalConfigService.getConfigs(['wechatJsapiTicket']);
    const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
    const str = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signature = this.sha1(str);
    Logger.debug(`生成JSAPI签名，URL: ${url}`);
    return { appId, nonceStr, timestamp, signature };
  }

  async fetchQRCodeTicket(sceneStr: string) {
    Logger.log(`获取普通二维码ticket - sceneStr: ${sceneStr}`, 'OfficialService');
    const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
    Logger.log(
      `获取普通二维码的access_token: ${accessToken.substring(0, 10)}...`,
      'OfficialService',
    );

    const Url = formatUrl(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
    const params = {
      action_name: 'QR_STR_SCENE',
      action_info: { scene: { scene_str: sceneStr } },
    };

    Logger.log(`普通二维码请求参数: ${JSON.stringify(params)}`, 'OfficialService');
    const res = await axios.post(
      `${Url}/cgi-bin/qrcode/create?access_token=${accessToken}`,
      params,
    );

    Logger.log(`普通二维码创建响应: ${JSON.stringify(res.data)}`, 'OfficialService');
    const {
      data: { errmsg, ticket },
    } = res;

    if (errmsg) {
      Logger.error(`获取普通二维码ticket失败: ${errmsg}`, 'OfficialService');
      throw new HttpException(errmsg, HttpStatus.BAD_REQUEST);
    }

    Logger.log(`普通二维码ticket获取成功: ${ticket.substring(0, 20)}...`, 'OfficialService');
    return ticket;
  }

  async loginByCode(req, code: string) {
    const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
    const secret = await this.globalConfigService.getConfigs(['wechatOfficialAppSecret']);
    const Url = formatUrl(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
    const res = await axios.get(
      `${Url}/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${code}&grant_type=authorization_code`,
    );
    const {
      data: { errmsg, openid, access_token },
    } = res;

    if (errmsg) throw new HttpException(errmsg, HttpStatus.BAD_REQUEST);
    if (openid) {
      let user;
      user = await this.userService.getUserOpenId(openid);
      if (!user) {
        user = await this.userService.getUserFromOpenId(openid);
      }
      const userInfo = await axios.get(
        `${Url}/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`,
      );
      await this.userService.updateUserInfo(user.id, userInfo.data);
      Logger.log(`微信授权登录成功 - OpenID: ${openid}, UserID: ${user.id}`, 'OfficialService');
      return this.authService.loginByOpenId(user, req);
    }
  }

  /* 扫码事件 初次扫码关注 或者二次扫码都一样 */
  async scan(openID: string, sceneStr: string) {
    try {
      Logger.debug(`处理扫码事件 - OpenID: ${openID}, SceneStr: ${sceneStr}`, 'OfficialService');

      // 检查 sceneStr 是否有效
      if (!this.sceneStrMap[sceneStr]) {
        Logger.error(`非法扫码请求 - 未找到的sceneStr: ${sceneStr}`, 'OfficialService');
        throw new HttpException('非法参数', HttpStatus.BAD_REQUEST);
      }

      Logger.debug(`sceneStrMap中存在key [${sceneStr}]`, 'OfficialService');

      // 获取用户信息
      const user = await this.userService.getUserFromOpenId(openID, sceneStr);
      Logger.debug(
        `扫码用户信息 - OpenID: ${openID}, UserID: ${user?.id || '未找到'}`,
        'OfficialService',
      );

      // 记录扫描事件
      this.scanedSceneStrMap[sceneStr] = user.id;
      Logger.debug(`更新scanedSceneStrMap, 设置[${sceneStr}] = ${user.id}`, 'OfficialService');

      Logger.log(
        `用户扫码成功 - OpenID: ${openID}, UserID: ${user?.id || '未找到'}, SceneStr: ${sceneStr}`,
        'OfficialService',
      );
    } catch (error) {
      Logger.error(`扫码处理失败 - OpenID: ${openID}, Error: ${error.message}`, 'OfficialService');
      throw new HttpException('处理扫码事件时发生错误', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /* 轮询扫码登录响应 */
  async loginBySceneStr(req, body) {
    const { sceneStr } = body;
    Logger.debug(`轮询扫码登录 - SceneStr: ${sceneStr}`, 'OfficialService');
    Logger.debug(`当前scanedSceneStrMap状态检查`, 'OfficialService');

    if (!this.sceneStrMap[sceneStr]) {
      Logger.debug(`sceneStr [${sceneStr}] 不存在于sceneStrMap中`, 'OfficialService');
      return;
    }

    const userId = this.scanedSceneStrMap[sceneStr];
    if (!userId) {
      Logger.debug(`userId不存在于scanedSceneStrMap[${sceneStr}]中`, 'OfficialService');
      return '';
    }

    Logger.debug(`找到匹配的userId: ${userId}`, 'OfficialService');
    const user = await this.userService.getUserById(userId);

    Logger.log(`扫码登录成功 - UserID: ${userId}, SceneStr: ${sceneStr}`, 'OfficialService');

    delete this.scanedSceneStrMap[sceneStr];
    Logger.debug(`从scanedSceneStrMap中删除 [${sceneStr}]`, 'OfficialService');

    return this.authService.loginByOpenId(user, req);
  }

  /* 扫码事件 绑定微信 */
  async scanBindWx(openId: string, sceneStr) {
    Logger.debug(`处理绑定微信扫码 - OpenID: ${openId}, SceneStr: ${sceneStr}`, 'OfficialService');

    if (!this.sceneStrMap[sceneStr]) {
      Logger.error(`非法参数 - sceneStr [${sceneStr}] 不在sceneStrMap中`, 'OfficialService');
      throw new HttpException('非法参数', HttpStatus.BAD_REQUEST);
    }

    const userId = sceneStr.split('/')[1];
    Logger.debug(`解析的UserID: ${userId}`, 'OfficialService');

    const bindRes = await this.userService.bindWx(openId, userId);

    this.scanedSceneStrMap[sceneStr] = bindRes;
    Logger.debug(`更新scanedSceneStrMap, 设置[${sceneStr}]`, 'OfficialService');

    Logger.log(`微信绑定成功 - OpenID: ${openId}, UserID: ${userId}`, 'OfficialService');
    return bindRes;
  }

  /* 轮询绑定结果 */
  async bindWxBySceneStr(req, sceneStr: string) {
    if (!this.sceneStrMap[sceneStr]) throw new HttpException('非法参数', HttpStatus.BAD_REQUEST);
    const { id } = req.user;
    const res = this.scanedSceneStrMap[sceneStr];
    if (!res) return '';
    delete this.scanedSceneStrMap[sceneStr];
    Logger.log(`微信绑定确认 - UserID: ${id}, SceneStr: ${sceneStr}`, 'OfficialService');
    return res;
  }

  async verify(signature: string, nonce: string, timestamp: string) {
    const token = (await this.globalConfigService.getConfigs(['wechatOfficialToken'])) || '';
    return (await this.sha1([token, nonce, timestamp].sort().join(''))) == signature;
  }

  sha1(data: string) {
    return crypto.createHash('sha1').update(data).digest('hex');
  }

  async genXmlMsgByConfig(xmlData, msgKey) {
    const msg = await this.globalConfigService.getConfigs([msgKey]);
    Logger.debug(`使用配置消息 [${msgKey}]`, 'OfficialService');
    return this.genXmlMsg(xmlData, msg);
  }

  async genXmlMsg(xmlData, msg) {
    // 辅助函数，安全地获取字段值
    const getXmlValue = field => {
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
      Logger.error(`缺少FromUserName字段: ${JSON.stringify(xmlData)}`, 'OfficialService');
      throw new HttpException('缺少必要的XML字段', HttpStatus.BAD_REQUEST);
    }

    if (!toUser) {
      Logger.error(`缺少ToUserName字段: ${JSON.stringify(xmlData)}`, 'OfficialService');
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
  }

  /* 创建自定义菜单 */
  async createMenu(menuData: any) {
    try {
      const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
      const Url = formatUrl(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
      const res = await axios.post(
        `${Url}/cgi-bin/menu/create?access_token=${accessToken}`,
        menuData,
      );
      const { data } = res;

      Logger.log(`创建自定义菜单成功`, 'OfficialService');
      return data;
    } catch (error) {
      Logger.error(`创建自定义菜单失败: ${error.message}`, 'OfficialService');
      throw new HttpException(
        error.response?.data?.errmsg || '创建自定义菜单失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 查询自定义菜单 */
  async getMenu() {
    try {
      const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
      const Url = formatUrl(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
      const res = await axios.get(`${Url}/cgi-bin/menu/get?access_token=${accessToken}`);
      const { data } = res;
      Logger.log(`查询自定义菜单成功: ${JSON.stringify(data)}`, 'OfficialService');
      Logger.log(`查询自定义菜单成功`, 'OfficialService');
      return data;
    } catch (error) {
      Logger.error(`查询自定义菜单失败: ${error.message}`, 'OfficialService');
      throw new HttpException(
        error.response?.data?.errmsg || '查询自定义菜单失败',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 删除自定义菜单 */
  async deleteMenu() {
    try {
      const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
      const Url = formatUrl(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
      const res = await axios.get(`${Url}/cgi-bin/menu/delete?access_token=${accessToken}`);
      const { data } = res;

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

  /* 绑定旧账号微信 */
  async bindWxByOldWechat(req, sceneStr: string) {
    try {
      Logger.log(`开始处理旧账号迁移 - SceneStr: ${sceneStr}`, 'OfficialService');

      if (!this.sceneStrMap[sceneStr]) {
        Logger.log(`非法参数 - sceneStr [${sceneStr}] 不在sceneStrMap中`, 'OfficialService');
        throw new HttpException('非法参数', HttpStatus.BAD_REQUEST);
      }

      // 获取当前用户信息
      const { id: currentUserId } = req.user;
      Logger.log(`当前用户ID: ${currentUserId}`, 'OfficialService');

      // 从sceneStr获取关联的旧OpenID
      const openidData = this.scanedSceneStrMap[sceneStr];
      if (!openidData) {
        Logger.log(`未找到关联的旧OpenID数据 - sceneStr: ${sceneStr}`, 'OfficialService');
        return '';
      }

      // openidData中直接包含旧公众号的openid
      const oldOpenId = openidData.openid;
      if (!oldOpenId) {
        Logger.log(`旧OpenID数据格式错误 - 数据: ${JSON.stringify(openidData)}`, 'OfficialService');
        throw new HttpException('无效的OpenID数据', HttpStatus.BAD_REQUEST);
      }

      // 查询旧OpenID是否存在对应用户
      const oldUser = await this.userService.getUserOpenId(oldOpenId);
      if (!oldUser) {
        Logger.log(`未找到使用旧OpenID的用户 - OpenID: ${oldOpenId}`, 'OfficialService');
        return {
          success: false,
          message: '未找到旧账号，迁移失败',
        };
      }

      // 获取当前用户信息
      const currentUser = await this.userService.getUserById(currentUserId);
      if (!currentUser) {
        Logger.log(`未找到当前用户 - ID: ${currentUserId}`, 'OfficialService');
        throw new HttpException('当前用户不存在', HttpStatus.BAD_REQUEST);
      }

      // 获取当前用户的openId
      const currentOpenId = currentUser.openId;
      if (!currentOpenId) {
        Logger.log(`当前用户未绑定微信 - ID: ${currentUserId}`, 'OfficialService');
        throw new HttpException('当前用户未绑定微信', HttpStatus.BAD_REQUEST);
      }

      Logger.log(
        `找到旧账号信息 - 旧用户ID: ${oldUser.id}, 旧OpenID: ${oldOpenId}`,
        'OfficialService',
      );
      Logger.log(
        `当前用户信息 - 用户ID: ${currentUserId}, OpenID: ${currentOpenId}`,
        'OfficialService',
      );

      // 使用迁移专用方法进行OpenID更新
      // 1. 将旧账号的OpenID更新为新账号的OpenID
      const updateOldResult = await this.userService.updateUserOpenId(oldUser.id, currentOpenId);
      if (!updateOldResult.status) {
        Logger.log(`更新旧账号OpenID失败: ${updateOldResult.msg}`, 'OfficialService');
        return {
          success: false,
          message: `更新旧账号时出错: ${updateOldResult.msg}`,
        };
      }
      Logger.log(
        `成功更新旧账号OpenID - 用户ID: ${oldUser.id}, 新OpenID: ${currentOpenId}`,
        'OfficialService',
      );

      // 2. 清空当前账号的OpenID
      const updateCurrentResult = await this.userService.updateUserOpenId(currentUserId, null);
      if (!updateCurrentResult.status) {
        Logger.log(`清空当前账号OpenID失败: ${updateCurrentResult.msg}`, 'OfficialService');
        Logger.log(`尝试回滚旧账号OpenID更新`, 'OfficialService');

        // 尝试回滚旧账号的修改
        const rollbackResult = await this.userService.updateUserOpenId(oldUser.id, oldOpenId);
        if (!rollbackResult.status) {
          Logger.log(`回滚失败，旧账号状态可能已损坏: ${rollbackResult.msg}`, 'OfficialService');
        }

        return {
          success: false,
          message: `清空当前账号时出错: ${updateCurrentResult.msg}`,
        };
      }
      Logger.log(`成功清空当前账号OpenID - 用户ID: ${currentUserId}`, 'OfficialService');

      // 清理sceneStrMap
      delete this.scanedSceneStrMap[sceneStr];
      Logger.log(`从scanedSceneStrMap中删除 [${sceneStr}]`, 'OfficialService');

      // 返回迁移成功信息
      return {
        success: true,
        message: '账号迁移成功，现在可以使用旧账号登录',
        needRelogin: true,
      };
    } catch (error) {
      Logger.log(`旧账号迁移处理失败: ${error.message}`, 'OfficialService');
      throw new HttpException('处理账号迁移时发生错误', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /* 扫码事件 旧账号微信扫码 */
  async scanOldWechat(openId: string, sceneStr: string) {
    Logger.debug(
      `处理旧账号微信扫码 - OpenID: ${openId}, SceneStr: ${sceneStr}`,
      'OfficialService',
    );

    if (!this.sceneStrMap[sceneStr]) {
      Logger.error(`非法参数 - sceneStr [${sceneStr}] 不在sceneStrMap中`, 'OfficialService');
      throw new HttpException('非法参数', HttpStatus.BAD_REQUEST);
    }

    // openId就是用户在旧公众号的openid (fromUserName)
    const oldOpenId = openId;

    // 直接检查数据库中是否有使用这个openid绑定的账号
    const oldUser = await this.userService.getUserOpenId(oldOpenId);
    if (!oldUser) {
      // 没有找到绑定的账号
      Logger.warn(`未找到使用该OpenID的旧账号 - OpenID: ${oldOpenId}`, 'OfficialService');

      // 将错误信息保存到scanedSceneStrMap
      this.scanedSceneStrMap[sceneStr] = {
        success: false,
        error: 'not_found',
        message: '未找到绑定此微信的旧账号',
      };

      return 'not_found'; // 返回错误类型
    }

    // 找到了绑定的账号
    Logger.debug(`找到使用该OpenID的旧账号 - UserID: ${oldUser.id}`, 'OfficialService');

    // 将旧账号OpenID保存到scanedSceneStrMap
    this.scanedSceneStrMap[sceneStr] = {
      success: true,
      openid: oldOpenId,
      userId: oldUser.id,
    };

    Logger.log(`旧账号关联成功 - OpenID: ${oldOpenId}, UserID: ${oldUser.id}`, 'OfficialService');
    return true; // 成功时返回true
  }

  /* 获取旧账号迁移的sceneStr */
  async getQRSceneStrByOldWechat(req) {
    const { id } = req.user;
    Logger.log(`为用户${id}生成旧账号迁移sceneStr`, 'OfficialService');

    // 生成唯一的sceneStr
    const sceneStr = `${createRandomNonceStr(32)}#${id}`;
    Logger.log(`生成的sceneStr: ${sceneStr}`, 'OfficialService');

    // 保存到sceneStrMap
    this.sceneStrMap[sceneStr] = true;
    Logger.log(`已将sceneStr加入sceneStrMap`, 'OfficialService');

    return sceneStr;
  }

  /* 获取旧公众号的二维码ticket */
  async getOldQRCodeTicket(sceneStr: string) {
    Logger.log(`开始获取旧公众号二维码ticket，sceneStr: ${sceneStr}`, 'OfficialService');

    // 保存sceneStr到sceneStrMap (如果不存在则添加)
    if (!this.sceneStrMap[sceneStr]) {
      Logger.log(`将sceneStr添加到sceneStrMap: ${sceneStr}`, 'OfficialService');
      this.sceneStrMap[sceneStr] = true;
    }

    const oldAccessToken = await this.globalConfigService.getConfigs(['oldWechatAccessToken']);

    if (!oldAccessToken) {
      Logger.error('无法获取旧公众号访问令牌', 'OfficialService');
      throw new HttpException('无法获取旧公众号访问令牌', HttpStatus.BAD_REQUEST);
    }

    Logger.log(
      `成功获取旧公众号access_token: ${oldAccessToken.substring(0, 10)}...`,
      'OfficialService',
    );
    const ticket = await this.fetchQRCodeTicketWithToken(sceneStr, oldAccessToken);
    Logger.log(`成功获取旧公众号ticket: ${ticket.substring(0, 15)}...`, 'OfficialService');

    return ticket;
  }

  /* 使用指定的token创建二维码ticket */
  async fetchQRCodeTicketWithToken(sceneStr: string, accessToken: string) {
    try {
      const Url = formatUrl(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
      const params = {
        action_name: 'QR_STR_SCENE',
        action_info: { scene: { scene_str: sceneStr } },
      };

      Logger.log(
        `创建二维码请求 - URL: ${Url}/cgi-bin/qrcode/create, token: ${accessToken.substring(
          0,
          10,
        )}...`,
        'OfficialService',
      );
      Logger.log(`请求参数: ${JSON.stringify(params)}`, 'OfficialService');

      const res = await axios.post(
        `${Url}/cgi-bin/qrcode/create?access_token=${accessToken}`,
        params,
      );

      Logger.log(`二维码创建响应: ${JSON.stringify(res.data)}`, 'OfficialService');

      const {
        data: { errmsg, ticket, errcode },
      } = res;

      if (errmsg || errcode) {
        Logger.error(`创建二维码失败 - 错误码: ${errcode}, 错误信息: ${errmsg}`, 'OfficialService');
        throw new HttpException(errmsg || '创建二维码失败', HttpStatus.BAD_REQUEST);
      }

      if (!ticket) {
        Logger.error('创建二维码失败 - 未返回ticket', 'OfficialService');
        throw new HttpException('未获取到二维码ticket', HttpStatus.BAD_REQUEST);
      }

      return ticket;
    } catch (error) {
      Logger.error(`创建二维码异常: ${error.message}`, 'OfficialService');
      throw new HttpException(error.message || '创建二维码失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
