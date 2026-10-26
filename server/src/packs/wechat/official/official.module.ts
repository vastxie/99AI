import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FastXmlMiddleware } from './fast-xml.middleware';
import { OfficialController } from './official.controller';
import { OfficialService } from './official.service';
import { WechatOfficialOAuthProvider } from './wechat-official-oauth.provider';
import { WechatOfficialQrProvider } from './wechat-official-qr.provider';
import { WechatOfficialTokenService } from './wechat-official-token.service';
import { WechatOpenWebOAuthProvider } from './wechat-open-web-oauth.provider';

@Global()
@Module({
  controllers: [OfficialController],
  providers: [
    WechatOfficialTokenService,
    OfficialService,
    WechatOfficialOAuthProvider,
    WechatOfficialQrProvider,
    WechatOpenWebOAuthProvider,
  ],
  exports: [WechatOfficialTokenService, OfficialService, WechatOfficialOAuthProvider],
})
export class OfficialModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FastXmlMiddleware).forRoutes(OfficialController);
  }
}
