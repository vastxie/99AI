"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerService = void 0;
const common_1 = require("@nestjs/common");
const nodemailer = require("nodemailer");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let MailerService = class MailerService {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    async sendMail(options) {
        try {
            const configs = await this.globalConfigService.getConfigs([
                'MAILER_HOST',
                'MAILER_PORT',
                'MAILER_USER',
                'MAILER_PASS',
                'MAILER_SECURE',
                'siteName',
                'siteUrl',
            ]);
            const html = `
<div style="font-family: Helvetica, Arial, sans-serif; max-width: 500px; margin: auto; padding: 40px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);">
  <h2 style="text-align: center; color: #111; font-weight: 400;">验证您的邮箱</h2>
  <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
  <div style="text-align: center; margin-bottom: 30px;">
    <span style="display: inline-block; font-size: 42px; font-weight: 700; padding: 10px 20px; background-color: #f5f5f5; border-radius: 10px;">${options.context.code}</span>
  </div>
  <p style="font-size: 16px; color: #111; text-align: center; line-height: 1.5;">此验证码将在 10 分钟后失效，非本人操作请忽略。</p>
  <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;">
  <p style="font-size: 14px; color: #999; text-align: center;">点击访问：<a href="${configs.siteUrl}" style="color: #007AFF; text-decoration: none;">${configs.siteName}</a></p>
</div>`;
            const transporter = nodemailer.createTransport({
                host: configs.MAILER_HOST,
                port: configs.MAILER_PORT,
                secure: (configs.MAILER_SECURE === '1') ? true : false,
                auth: {
                    user: configs.MAILER_USER,
                    pass: configs.MAILER_PASS,
                },
            });
            await transporter.sendMail({
                from: configs.MAILER_USER,
                to: options.to,
                subject: `验证码${options.context.code}`,
                html: html,
            });
        }
        catch (error) {
            console.error('error: ', error);
            throw new common_1.HttpException('邮件发送失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
MailerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], MailerService);
exports.MailerService = MailerService;
