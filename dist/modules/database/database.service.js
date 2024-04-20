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
        await this.createSystemReservedApps();
    }
    async checkSuperAdmin() {
        const user = await this.connection.query(`SELECT * FROM users WHERE role = 'super'`);
        if (!user || user.length === 0) {
            const superPassword = bcrypt.hashSync('123456', 10);
            const adminPassword = bcrypt.hashSync('123456', 10);
            const superEmail = 'super';
            const adminEmail = 'admin';
            const superUserinfo = { username: 'super', password: superPassword, status: 1, email: superEmail, sex: 1, role: 'super' };
            const adminUserinfo = { username: 'admin', password: adminPassword, status: 0, email: adminEmail, sex: 1, role: 'admin' };
            await this.createDefaultUser(superUserinfo);
            await this.createDefaultUser(adminUserinfo);
        }
    }
    async createDefaultUser(userInfo) {
        try {
            const { username, password, status, email, role } = userInfo;
            const user = await this.connection.query(`INSERT INTO users (username, password, status, email, role) VALUES ('${username}', '${password}', '${status}', '${email}', '${role}')`);
            const userId = user.insertId;
            const balance = await this.connection.query(`INSERT INTO balance (userId, balance, usesLeft, paintCount) VALUES ('${userId}', 0, 1000, 100)`);
            common_1.Logger.log(`初始化创建${role}用户成功、用户名为[${username}]、初始密码为[${username === 'super' ? 'nine-super' : '123456'}] ==============> 请注意查阅`, 'DatabaseService');
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('创建默认超级管理员失败！', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async checkSiteBaseConfig() {
        const keys = ['siteName', 'qqNumber', 'vxNumber', 'robotAvatar', 'userDefautlAvatar'];
        const result = await this.connection.query(`
  SELECT COUNT(*) AS count FROM config WHERE \`configKey\` IN (${keys.map((k) => `'${k}'`).join(',')})
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
                { configKey: 'qqNumber', configVal: '', public: 1, encry: 0 },
                { configKey: 'vxNumber', configVal: '', public: 1, encry: 0 },
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
                { configKey: 'openaiBaseUrl', configVal: 'https://api.lightai.io', public: 0, encry: 0 },
                { configKey: 'openaiTimeout', configVal: '300', public: 0, encry: 0 },
                { configKey: 'openaiBaseKey', configVal: 'sk-', public: 0, encry: 0 },
                { configKey: 'mjTranslatePrompt', configVal: `Translate any given phrase from any language into English. For instance, when I input '{可爱的熊猫}', you should output '{cute panda}', with no period at the end.`, public: 0, encry: 0 },
                { configKey: 'noticeInfo', configVal: noticeInfo, public: 1, encry: 0 },
                { configKey: 'registerSendStatus', configVal: '1', public: 1, encry: 0 },
                { configKey: 'registerSendModel3Count', configVal: '30', public: 1, encry: 0 },
                { configKey: 'registerSendModel4Count', configVal: '3', public: 1, encry: 0 },
                { configKey: 'registerSendDrawMjCount', configVal: '3', public: 1, encry: 0 },
                { configKey: 'firstRegisterSendStatus', configVal: '1', public: 1, encry: 0 },
                { configKey: 'firstRegisterSendRank', configVal: '500', public: 1, encry: 0 },
                { configKey: 'firstRregisterSendModel3Count', configVal: '10', public: 1, encry: 0 },
                { configKey: 'firstRregisterSendModel4Count', configVal: '10', public: 1, encry: 0 },
                { configKey: 'firstRregisterSendDrawMjCount', configVal: '10', public: 1, encry: 0 },
                { configKey: 'inviteSendStatus', configVal: '1', public: 1, encry: 0 },
                { configKey: 'inviteGiveSendModel3Count', configVal: '0', public: 1, encry: 0 },
                { configKey: 'inviteGiveSendModel4Count', configVal: '0', public: 1, encry: 0 },
                { configKey: 'inviteGiveSendDrawMjCount', configVal: '0', public: 1, encry: 0 },
                { configKey: 'invitedGuestSendModel3Count', configVal: '10', public: 1, encry: 0 },
                { configKey: 'invitedGuestSendModel4Count', configVal: '10', public: 1, encry: 0 },
                { configKey: 'invitedGuestSendDrawMjCount', configVal: '10', public: 1, encry: 0 },
                { configKey: 'isVerifyEmail', configVal: '1', public: 1, encry: 0 },
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
    async createSystemReservedApps() {
        const systemApps = [
            { name: "提示词优化PromptOptimization", catId: 9900, des: "PromptOptimization", preset: "Translate any given phrase from any language into English. For instance, when I input '{可爱的熊猫}', you should output '{cute panda}', with no period at the end.", appModel: "gpt-3.5-turbo", isFixedModel: 1, isSystemReserved: 1 },
            { name: "思维导图MindMap", catId: 9900, des: "MindMap", preset: "我希望你使用markdown格式回答我得问题、我的需求是得到一份markdown格式的大纲、尽量做的精细、层级多一点、不管我问你什么、都需要您回复我一个大纲出来、我想使用大纲做思维导图、除了大纲之外、不要无关内容和总结。", appModel: "gpt-3.5-turbo", isFixedModel: 1, isSystemReserved: 1 },
        ];
        try {
            for (const app of systemApps) {
                const result = await this.connection.query(`SELECT COUNT(*) AS count FROM app WHERE name = ? AND des = ? AND isSystemReserved = ?`, [app.name, app.des, app.isSystemReserved]);
                const count = parseInt(result[0].count, 10);
                if (count === 0) {
                    await this.connection.query(`INSERT INTO app (name, catId, des, preset, appModel, isFixedModel, isSystemReserved) VALUES (?, ?, ?, ?, ?, ?, ?)`, [app.name, app.catId, app.des, app.preset, app.appModel, app.isFixedModel, app.isSystemReserved]);
                    common_1.Logger.log(`系统预留应用${app.name}创建成功`, 'DatabaseService');
                }
            }
        }
        catch (error) {
            console.log('创建系统预留应用过程中出现错误: ', error);
            throw new Error('创建系统预留应用失败！');
        }
    }
};
DatabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.Connection])
], DatabaseService);
exports.DatabaseService = DatabaseService;
