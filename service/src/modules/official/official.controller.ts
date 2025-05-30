import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { formatUrl } from '@/common/utils';
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateMenuDto } from './dto/createMenu.dto';
import { GetQrCodeDto } from './dto/getQrCode.dto';
import { OfficialService } from './official.service';

@ApiTags('official')
@Controller('official')
export class OfficialController {
  constructor(private readonly officialService: OfficialService) {}

  @Get('notify')
  @ApiOperation({ summary: '公众号通知接口GET' })
  async notify(@Req() req, @Query() query, @Body() body) {
    Logger.debug('GET通知 - ' + JSON.stringify(query), 'OfficialController');
    const result = await this.officialService.verify(query.signature, query.nonce, query.timestamp);
    return result ? query.echostr : '';
  }

  @Post('notify')
  @ApiOperation({ summary: '公众号通知接口POST' })
  async notifyPost(@Req() req, @Query() query, @Body() xmlData, @Res() res) {
    Logger.debug(`收到POST通知，完整请求体: ${JSON.stringify(xmlData)}`, 'OfficialController');

    if (!xmlData || !xmlData.xml) {
      Logger.warn('xmlData结构异常，缺少xml字段', 'OfficialController');
      return res.status(200).send('');
    }

    let xmlObject = xmlData.xml;

    // 处理可能的嵌套情况，确保xmlObject是一个对象而不是数组
    if (Array.isArray(xmlObject)) {
      Logger.debug('XML解析为数组，取第一个元素', 'OfficialController');
      xmlObject = xmlObject[0];
    } else if (xmlObject.xml && Array.isArray(xmlObject.xml)) {
      Logger.debug('XML存在嵌套结构，使用内部xml数组的第一个元素', 'OfficialController');
      xmlObject = xmlObject.xml[0];
    }

    Logger.debug(`标准化后的XML对象: ${JSON.stringify(xmlObject)}`, 'OfficialController');

    // 辅助函数，安全地访问XML字段
    const getXmlValue = field => {
      if (!xmlObject[field]) return null;
      return Array.isArray(xmlObject[field]) ? xmlObject[field][0] : xmlObject[field];
    };

    const msgType = getXmlValue('MsgType') || getXmlValue('msgtype');
    const event = getXmlValue('Event') || getXmlValue('event');
    const eventKey = getXmlValue('EventKey') || getXmlValue('eventkey');
    const content = getXmlValue('Content') || getXmlValue('content');
    const fromUserName = getXmlValue('FromUserName') || getXmlValue('fromusername');

    Logger.debug(
      `提取的字段 - MsgType: ${msgType}, Event: ${event}, EventKey: ${eventKey}`,
      'OfficialController',
    );

    /* 扫码 */
    if (msgType === 'event') {
      Logger.log(`接收到事件类型消息: ${event}`, 'OfficialController');
      if (event === 'VIEW' || event === 'CLICK') {
        return res.status(200).send('');
      }
      /* 扫码 */
      if (event === 'SCAN') {
        Logger.log(`接收到扫码事件, SceneStr: ${eventKey}`, 'OfficialController');
        const sceneStr = eventKey;
        /* 绑定微信以/区分 */
        if (sceneStr.includes('/')) {
          this.officialService.scanBindWx(fromUserName, sceneStr);
          const xmlMsg = await this.officialService.genXmlMsgByConfig(
            xmlObject,
            'officialBindAccountText',
          );
          return res.status(200).send(xmlMsg);
        }
        /* 旧账号迁移以#区分 */
        if (sceneStr.includes('#')) {
          const result = await this.officialService.scanOldWechat(fromUserName, sceneStr);
          let configKey;

          if (result === true) {
            configKey = 'officialOldAccountSuccessText'; // 成功
          } else if (result === 'not_found') {
            configKey = 'officialOldAccountNotFoundText'; // 未找到旧账号
          } else {
            configKey = 'officialOldAccountFailText'; // 其他失败
          }

          const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, configKey);
          return res.status(200).send(xmlMsg);
        }
        this.officialService.scan(fromUserName, sceneStr);
        const xmlMsg = await this.officialService.genXmlMsgByConfig(
          xmlObject,
          'officialScanLoginText',
        );
        return res.status(200).send(xmlMsg);
      }

      /* 订阅 */
      if (event === 'subscribe') {
        Logger.log(`接收到订阅事件, EventKey: ${eventKey}`, 'OfficialController');
        const sceneStr = eventKey ? eventKey.split('qrscene_')[1] : null;
        Logger.debug(`处理的sceneStr: ${sceneStr}`, 'OfficialController');

        /* 没有场景str则是单纯关注了直接返回 */
        if (!sceneStr) {
          const xmlMsg = await this.officialService.genXmlMsgByConfig(
            xmlObject,
            'officialSubscribeText',
          );
          return res.status(200).send(xmlMsg);
        }
        /* 绑定微信以/区分 */
        if (sceneStr.includes('/')) {
          this.officialService.scanBindWx(fromUserName, sceneStr);
          const xmlMsg = await this.officialService.genXmlMsgByConfig(
            xmlObject,
            'officialBindAccountText',
          );
          return res.status(200).send(xmlMsg);
        }
        /* 旧账号迁移以#区分 */
        if (sceneStr.includes('#')) {
          Logger.log(`接收到旧账号迁移事件, SceneStr: ${sceneStr}`, 'OfficialController');
          const result = await this.officialService.scanOldWechat(fromUserName, sceneStr);
          let configKey;

          if (result === true) {
            configKey = 'officialOldAccountSuccessText'; // 成功
          } else if (result === 'not_found') {
            configKey = 'officialOldAccountNotFoundText'; // 未找到旧账号
          } else {
            configKey = 'officialOldAccountFailText'; // 其他失败
          }

          const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, configKey);
          return res.status(200).send(xmlMsg);
        }
        this.officialService.scan(fromUserName, sceneStr);
        const xmlMsg = await this.officialService.genXmlMsgByConfig(
          xmlObject,
          'officialSubscribeText',
        );
        return res.status(200).send(xmlMsg);
      }

      /* 取消订阅 */
      if (event === 'unsubscribe') {
        Logger.log(`接收到取消订阅事件, 用户: ${fromUserName}`, 'OfficialController');
        return res.status(200).send('');
      }
    }

    /* 客户端发送了文字消息 */
    if (msgType === 'text') {
      Logger.log(
        `接收到文本消息: ${content && content.substring(0, 20)}${
          content && content.length > 20 ? '...' : ''
        }`,
        'OfficialController',
      );
      const xmlMsg = await this.officialService.genXmlMsgByConfig(
        xmlObject,
        'officialAutoReplyText',
      );
      return res.status(200).send(xmlMsg);
    }

    Logger.debug(`未识别的消息类型: ${msgType}, 返回默认响应`, 'OfficialController');
    return 'success';
  }

  @Post('getQRSceneStr')
  @ApiOperation({ summary: '获取登录二维码sceneStr' })
  async getQRSceneStr() {
    return this.officialService.getQRSceneStr();
  }

  @Post('getQRSceneStrByBind')
  @ApiOperation({ summary: '获取绑定二维码的sceneStr' })
  @UseGuards(JwtAuthGuard)
  async getQRSceneStrByBind(@Req() req: Request) {
    return this.officialService.getQRSceneStrByBind(req);
  }

  @Post('getQRSceneStrByOldWechat')
  @ApiOperation({ summary: '获取旧账号迁移二维码的sceneStr' })
  @UseGuards(JwtAuthGuard)
  async getQRSceneStrByOldWechat(@Req() req: Request) {
    Logger.log(`获取旧账号迁移二维码sceneStr - 用户ID: ${req.user.id}`, 'OfficialController');
    const sceneStr = await this.officialService.getQRSceneStrByOldWechat(req);
    Logger.log(`生成的sceneStr: ${sceneStr}`, 'OfficialController');
    return sceneStr;
  }

  @Get('getQRCode')
  @ApiOperation({ summary: '获取二维码' })
  async getQRCode(@Query() query: GetQrCodeDto) {
    Logger.log(`获取普通登录二维码 - sceneStr: ${query.sceneStr}`, 'OfficialController');

    if (process.env.ISDEV === 'true') {
      Logger.log('开发环境下，返回空二维码', 'OfficialController');
      return '';
    }

    try {
      const ticket = await this.officialService.getQRCodeTicket(query.sceneStr);
      Logger.log(
        `获取普通登录二维码ticket成功: ${ticket.substring(0, 20)}...`,
        'OfficialController',
      );

      const Url = formatUrl(process.env.weChatMpUrl || 'https://mp.weixin.qq.com');
      const qrCodeUrl = `${Url}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;

      Logger.log(`生成普通登录二维码URL: ${qrCodeUrl}`, 'OfficialController');
      return qrCodeUrl;
    } catch (error) {
      Logger.error(`获取普通登录二维码失败: ${error.message}`, 'OfficialController');
      throw error;
    }
  }

  @Post('loginBySceneStr')
  @ApiOperation({ summary: '扫码登录轮询查询' })
  async loginBySceneStr(@Req() req: Request, @Body() body: any) {
    return this.officialService.loginBySceneStr(req, body);
  }

  @Post('bindWxBySceneStr')
  @ApiOperation({ summary: '扫码绑定轮询查询' })
  @UseGuards(JwtAuthGuard)
  async bindWxBySceneStr(@Req() req: Request, @Body() body: GetQrCodeDto) {
    return this.officialService.bindWxBySceneStr(req, body.sceneStr);
  }

  @Post('bindWxByOldWechat')
  @ApiOperation({ summary: '绑定旧账号微信轮询查询' })
  @UseGuards(JwtAuthGuard)
  async bindWxByOldWechat(@Req() req: Request, @Body() body: GetQrCodeDto) {
    return this.officialService.bindWxByOldWechat(req, body.sceneStr);
  }

  @Post('getRedirectUrl')
  @ApiOperation({ summary: '获取登录跳转地址' })
  async getRedirectUrl(@Body() body: { url: string }) {
    return this.officialService.getRedirectUrl(body.url);
  }

  @Post('getJsapiTicket')
  @ApiOperation({ summary: '获取注册配置' })
  async getJsapiTicket(@Body() body: { url: string }) {
    return this.officialService.getJsapiTicket(body.url);
  }

  @Post('loginByCode')
  @ApiOperation({ summary: '公众号静默登录' })
  async loginByCode(@Req() req: Request, @Body() body: { code: string }) {
    return this.officialService.loginByCode(req, body.code);
  }

  @Post('menu')
  @ApiOperation({ summary: '创建自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async createMenu(@Body() menuData: CreateMenuDto) {
    Logger.log('创建自定义菜单', 'OfficialController');
    return this.officialService.createMenu(menuData);
  }

  @Get('menu')
  @ApiOperation({ summary: '获取自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async getMenu() {
    Logger.log('获取自定义菜单', 'OfficialController');
    return this.officialService.getMenu();
  }

  @Delete('menu')
  @ApiOperation({ summary: '删除自定义菜单' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async deleteMenu() {
    Logger.log('删除自定义菜单', 'OfficialController');
    return this.officialService.deleteMenu();
  }

  @Get('getOldQRCode')
  @ApiOperation({ summary: '获取旧公众号二维码（用于账号迁移）' })
  async getOldQRCode(@Query() query: GetQrCodeDto) {
    Logger.log(`获取旧公众号二维码 - sceneStr: ${query.sceneStr}`, 'OfficialController');

    if (process.env.ISDEV === 'true') {
      Logger.log('开发环境下，返回空二维码', 'OfficialController');
      return { success: true, data: '' };
    }

    try {
      // 获取旧公众号二维码ticket
      const ticket = await this.officialService.getOldQRCodeTicket(query.sceneStr);

      // 注意：确保oldWeChatMpUrl已配置
      const oldMpUrl = process.env.oldWeChatMpUrl;
      const defaultMpUrl = process.env.weChatMpUrl || 'https://mp.weixin.qq.com';
      const Url = formatUrl(oldMpUrl || defaultMpUrl);

      Logger.log(
        `使用MP URL: ${Url} (oldWeChatMpUrl=${oldMpUrl}, defaultMpUrl=${defaultMpUrl})`,
        'OfficialController',
      );

      const qrCodeUrl = `${Url}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
      Logger.log(`生成的二维码URL: ${qrCodeUrl}`, 'OfficialController');

      return qrCodeUrl;
    } catch (error) {
      Logger.error(`获取旧公众号二维码失败: ${error.message}`, 'OfficialController');
      throw error;
    }
  }
}
