import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { formatUrl } from '@/common/utils';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { GetQrCodeDto } from './dto/getQrCode.dto';
import { OfficialService } from './official.service';

@ApiTags('official')
@Controller('official')
export class OfficialController {
  constructor(private readonly officialService: OfficialService) {}

  @Get('notify')
  @ApiOperation({ summary: '公众号通知接口GET' })
  async notify(@Req() req, @Query() query, @Body() body) {
    console.log('get 通知>>>', query, body);
    const result = await this.officialService.verify(
      query.signature,
      query.nonce,
      query.timestamp
    );
    return result ? query.echostr : '';
  }

  @Post('notify')
  @ApiOperation({ summary: '公众号通知接口POST' })
  async notifyPost(@Req() req, @Query() query, @Body() xmlData, @Res() res) {
    const { xml } = xmlData;
    console.log('xml: ', xml);
    /* 扫码 */
    if (xml.msgtype[0] == 'event') {
      if (xml.event[0] == 'VIEW' || xml.event[0] == 'CLICK') {
        return res.status(200).send('');
      }
      /* 扫码 */
      if (xml.event[0] == 'SCAN') {
        console.log('扫码');
        const sceneStr = xml.eventkey[0];
        /* 绑定微信以/区分 */
        if (sceneStr.includes('/')) {
          this.officialService.scanBindWx(xml.fromusername[0], sceneStr);
          const xmlMsg = await this.officialService.genXmlMsgByConfig(
            xml,
            'officialBindAccountText'
          );
          return res.status(200).send(xmlMsg);
        }
        this.officialService.scan(xml.fromusername[0], sceneStr);
        const xmlMsg = await this.officialService.genXmlMsgByConfig(
          xml,
          'officialScanLoginText'
        );
        return res.status(200).send(xmlMsg);
      }

      /* 订阅 */
      if (xml.event[0] == 'subscribe') {
        console.log('订阅', xml.eventkey[0]);
        const sceneStr = xml.eventkey[0].split('qrscene_')[1];
        console.log('sceneStr: ', sceneStr);
        /* 没有场景str则是单纯关注了直接返回 */
        if (!sceneStr) {
          const xmlMsg = await this.officialService.genXmlMsgByConfig(
            xml,
            'officialSubscribeText'
          );
          return res.status(200).send(xmlMsg);
        }
        /* 绑定微信以/区分 */
        if (sceneStr.includes('/')) {
          this.officialService.scanBindWx(xml.fromusername[0], sceneStr);
          const xmlMsg = await this.officialService.genXmlMsgByConfig(
            xml,
            'officialBindAccountText'
          );
          return res.status(200).send(xmlMsg);
        }
        this.officialService.scan(xml.fromusername[0], sceneStr);
        const xmlMsg = await this.officialService.genXmlMsgByConfig(
          xml,
          'officialSubscribeText'
        );
        return res.status(200).send(xmlMsg);
      }

      /* 取消订阅 */
      if (xml.event[0] == 'unsubscribe') {
        return res.status(200).send('');
      }
    }

    /* 客户端发送了文字消息 */
    if (xml.msgtype[0] == 'text') {
      const aotoPlayMsg = await this.officialService.aotoPlay(xml.content[0]);
      const xmlMsg = await this.officialService.genXmlMsg(xml, aotoPlayMsg);
      return res.status(200).send(xmlMsg);
    }
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

  @Get('getQRCode')
  @ApiOperation({ summary: '获取二维码' })
  async getQRCode(@Query() query: GetQrCodeDto) {
    if (process.env.ISDEV === 'TRUE') return '';
    const ticket = await this.officialService.getQRCodeTicket(query.sceneStr);
    const Url = formatUrl(
      process.env.weChatMpUrl || 'https://mp.weixin.qq.com'
    );
    return `${Url}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
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
}
