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
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = require("bcryptjs");
const typeorm_1 = require("typeorm");
let DatabaseService = class DatabaseService {
    constructor(connection) {
        this.connection = connection;
    }
    async onModuleInit() {
        await this.checkSuperAdmin();
        await this.checkSiteBaseConfig();
    }
    async checkSuperAdmin() {
        const user = await this.connection.query(`SELECT * FROM users WHERE role = 'super'`);
        if (!user || user.length === 0) {
            const superPassword = bcrypt.hashSync('123456', 10);
            const adminPassword = bcrypt.hashSync('123456', 10);
            const superEmail = 'super';
            const adminEmail = 'admin';
            const superUserinfo = {
                username: 'super',
                password: superPassword,
                status: 1,
                email: superEmail,
                sex: 1,
                role: 'super',
            };
            const adminUserinfo = {
                username: 'admin',
                password: adminPassword,
                status: 0,
                email: adminEmail,
                sex: 1,
                role: 'admin',
            };
            await this.createDefaultUser(superUserinfo);
            await this.createDefaultUser(adminUserinfo);
        }
    }
    async createDefaultUser(userInfo) {
        try {
            const { username, password, status, email, role } = userInfo;
            const user = await this.connection.query(`INSERT INTO users (username, password, status, email, role) VALUES ('${username}', '${password}', '${status}', '${email}', '${role}')`);
            const userId = user.insertId;
            await this.connection.query(`INSERT INTO balance (userId, balance, usesLeft, paintCount) VALUES ('${userId}', 0, 1000, 100)`);
            common_1.Logger.log(`初始化创建${role}用户成功、用户名为[${username}]、初始密码为[${username === 'super' ? 'super' : '123456'}] ==============> 请注意查阅`, 'DatabaseService');
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('创建默认超级管理员失败！', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async checkSiteBaseConfig() {
        const keys = ['siteName', 'robotAvatar'];
        const result = await this.connection.query(`
  SELECT COUNT(*) AS count FROM config WHERE \`configKey\` IN (${keys
            .map((k) => `'${k}'`)
            .join(',')})
`);
        const count = parseInt(result[0].count);
        if (count === 0) {
            await this.createBaseSiteConfig();
        }
    }
    async createBaseSiteConfig() {
        try {
            const code = ``;
            const noticeInfo = `
#### AIWeb 欢迎您
 - 欢迎使用 AIWeb
 - 初始管理员账号密码  super  123456 【前台后台登录都可以修改】
 - 初始预览账号密码  admin  123456 【为后台查看账号 仅可查看部分非敏感数据】
`;
            const defaultConfig = [
                { configKey: 'siteName', configVal: '', public: 1, encry: 0 },
                { configKey: 'robotAvatar', configVal: '', public: 1, encry: 0 },
                {
                    configKey: 'userDefautlAvatar',
                    configVal: '',
                    public: 0,
                    encry: 0,
                },
                { configKey: 'baiduCode', configVal: code, public: 1, encry: 0 },
                { configKey: 'baiduSiteId', configVal: '', public: 0, encry: 0 },
                {
                    configKey: 'baiduToken',
                    configVal: '',
                    public: 0,
                    encry: 0,
                },
                { configKey: 'buyCramiAddress', configVal: '', public: 1, encry: 0 },
                {
                    configKey: 'openaiBaseUrl',
                    configVal: 'https://api.lightai.io',
                    public: 0,
                    encry: 0,
                },
                { configKey: 'openaiTimeout', configVal: '300', public: 0, encry: 0 },
                { configKey: 'openaiBaseKey', configVal: 'sk-', public: 0, encry: 0 },
                {
                    configKey: 'mjTranslatePrompt',
                    configVal: `Translate any given phrase from any language into English. For instance, when I input '{可爱的熊猫}', you should output '{cute panda}', with no period at the end.`,
                    public: 0,
                    encry: 0,
                },
                { configKey: 'noticeInfo', configVal: noticeInfo, public: 1, encry: 0 },
                {
                    configKey: 'registerSendStatus',
                    configVal: '1',
                    public: 1,
                    encry: 0,
                },
                {
                    configKey: 'registerSendModel3Count',
                    configVal: '30',
                    public: 1,
                    encry: 0,
                },
                {
                    configKey: 'registerSendModel4Count',
                    configVal: '3',
                    public: 1,
                    encry: 0,
                },
                {
                    configKey: 'registerSendDrawMjCount',
                    configVal: '3',
                    public: 1,
                    encry: 0,
                },
                {
                    configKey: 'firstRegisterSendStatus',
                    configVal: '1',
                    public: 1,
                    encry: 0,
                },
                {
                    configKey: 'firstRegisterSendRank',
                    configVal: '500',
                    public: 1,
                    encry: 0,
                },
                {
                    configKey: 'firstRregisterSendModel3Count',
                    configVal: '10',
                    public: 1,
                    encry: 0,
                },
                {
                    configKey: 'firstRregisterSendModel4Count',
                    configVal: '10',
                    public: 1,
                    encry: 0,
                },
                {
                    configKey: 'firstRregisterSendDrawMjCount',
                    configVal: '10',
                    public: 1,
                    encry: 0,
                },
                { configKey: 'isVerifyEmail', configVal: '1', public: 1, encry: 0 },
                { configKey: 'model3Name', configVal: '普通积分', public: 1, encry: 0 },
                { configKey: 'model4Name', configVal: '高级积分', public: 1, encry: 0 },
                { configKey: 'drawMjName', configVal: '绘画积分', public: 1, encry: 0 },
                {
                    configKey: 'drawingStyles',
                    configVal: '油画风格,像素风格,赛博朋克,动漫,日系,超现实主义,油画,卡通,插画,海报,写实,扁平,中国风,水墨画,唯美二次元,印象派,炫彩插画,像素艺术,艺术创想,色彩主义,数字艺术',
                    public: 1,
                    encry: 0,
                },
            ];
            const res = await this.connection.query(`INSERT INTO config (configKey, configVal, public, encry) VALUES ${defaultConfig
                .map((d) => `('${d.configKey}', '${d.configVal.replace(/'/g, "\\'")}', '${d.public}', '${d.encry}')`)
                .join(', ')}`);
            common_1.Logger.log(`初始化网站配置信息成功、如您需要修改网站配置信息，请前往管理系统系统配置设置 ==============> 请注意查阅`, 'DatabaseService');
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('创建默认网站配置失败！', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
DatabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.Connection])
], DatabaseService);
exports.DatabaseService = DatabaseService;
