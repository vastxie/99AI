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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatisticService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("../user/user.entity");
const typeorm_2 = require("typeorm");
const chatLog_entity_1 = require("../chatLog/chatLog.entity");
const balance_constant_1 = require("../../common/constants/balance.constant");
const date_1 = require("../../common/utils/date");
const axios_1 = require("axios");
const config_entity_1 = require("../globalConfig/config.entity");
const order_entity_1 = require("../order/order.entity");
const midjourney_entity_1 = require("../midjourney/midjourney.entity");
const midjourney_constant_1 = require("../../common/constants/midjourney.constant");
let StatisticService = class StatisticService {
    constructor(userEntity, chatLogEntity, configEntity, orderEntity, midjourneyEntity) {
        this.userEntity = userEntity;
        this.chatLogEntity = chatLogEntity;
        this.configEntity = configEntity;
        this.orderEntity = orderEntity;
        this.midjourneyEntity = midjourneyEntity;
    }
    async getBaseStatistic() {
        const userCount = await this.countUsers();
        const newUserCount = await this.countNewUsersToday();
        const chatCount = await this.countChats();
        const newChatCount = await this.countNewChatsToday();
        const drawCount = await this.countDraws();
        const dellDrawCount = await this.countNewDrawsToday();
        const mjDrawCount = await this.countNewMidhourneysToday();
        const orderCount = await this.countOrders();
        const newOrderCount = await this.countNewOrdersToday();
        return {
            userCount,
            newUserCount,
            chatCount,
            newChatCount,
            drawCount,
            newDrawCount: mjDrawCount + dellDrawCount,
            orderCount,
            newOrderCount,
        };
    }
    async getChatStatistic({ days = 7 }) {
        const chatData = await this.countChatsByTimeRange(days);
        const drawData = await this.countDrawsByTimeRange(days);
        const mjDrawData = await this.countMjDrawsByTimeRange(days);
        return {
            date: chatData.map((item) => item.date),
            chat: chatData.map((item) => item.value),
            draw: drawData.map((item, index) => {
                return item.value + mjDrawData[index].value;
            }),
        };
    }
    async getBaiduVisit({ days = 7 }) {
        const data = await this.getBaiduStatistics(days);
        return data;
    }
    async countUsers() {
        const userCount = await this.userEntity.count();
        return userCount;
    }
    async countNewUsersToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const queryBuilder = this.userEntity.createQueryBuilder('user');
        const userCount = await queryBuilder.where('user.createdAt >= :today', { today }).andWhere('user.createdAt < :tomorrow', { tomorrow }).getCount();
        return userCount;
    }
    async countChats() {
        const chatCount = await this.chatLogEntity.count({ where: { type: balance_constant_1.ChatType.NORMAL_CHAT } });
        return chatCount;
    }
    async countNewChatsToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const queryBuilder = this.chatLogEntity.createQueryBuilder('chatLog');
        const chatCount = await queryBuilder
            .where('chatLog.type = :type', { type: balance_constant_1.ChatType.NORMAL_CHAT })
            .andWhere('chatLog.createdAt >= :today', { today })
            .andWhere('chatLog.createdAt < :tomorrow', { tomorrow })
            .getCount();
        return chatCount;
    }
    async countDraws() {
        const drawCount = await this.chatLogEntity.count({ where: { type: balance_constant_1.ChatType.PAINT } });
        return drawCount;
    }
    async countNewDrawsToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const queryBuilder = this.chatLogEntity.createQueryBuilder('chatLog');
        const drawCount = await queryBuilder
            .where('chatLog.type = :type', { type: balance_constant_1.ChatType.PAINT })
            .andWhere('chatLog.createdAt >= :today', { today })
            .andWhere('chatLog.createdAt < :tomorrow', { tomorrow })
            .getCount();
        return drawCount;
    }
    async countNewMidhourneysToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const queryBuilder = this.midjourneyEntity.createQueryBuilder('midjourney');
        const midjourneyCount = await queryBuilder
            .where('midjourney.createdAt >= :today', { today })
            .andWhere('midjourney.createdAt < :tomorrow', { tomorrow })
            .getCount();
        return midjourneyCount;
    }
    async countChatsByTimeRange(days) {
        var _a, _b;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
        const queryBuilder = this.chatLogEntity.createQueryBuilder('chatlog');
        const result = await queryBuilder
            .select(`DATE(chatlog.createdAt) as date, COUNT(*) as count`)
            .where(`chatlog.type = :type`, { type: balance_constant_1.ChatType.NORMAL_CHAT })
            .andWhere('chatlog.createdAt >= :startDate', { startDate })
            .groupBy('date')
            .orderBy('date')
            .getRawMany();
        const dailyData = [];
        const currentDate = startDate;
        for (let i = 0; i < days; i++) {
            const dateString = (0, date_1.formatDate)(new Date(currentDate), 'M.DD');
            const count = (_b = (_a = result.find((r) => (0, date_1.formatDate)(new Date(r.date), 'M.DD') === dateString)) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0;
            if (count > 0) {
                dailyData.push({ date: dateString, value: Number(count) });
            }
            else {
                dailyData.push({ date: dateString, value: 0 });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dailyData;
    }
    async countDrawsByTimeRange(days) {
        var _a, _b;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
        const queryBuilder = this.chatLogEntity.createQueryBuilder('chatlog');
        const result = await queryBuilder
            .select(`DATE(chatlog.createdAt) as date, COUNT(*) as count`)
            .where(`chatlog.type = :type`, { type: balance_constant_1.ChatType.PAINT })
            .andWhere('chatlog.createdAt >= :startDate', { startDate })
            .groupBy('date')
            .orderBy('date')
            .getRawMany();
        const dailyData = [];
        const currentDate = startDate;
        for (let i = 0; i < days; i++) {
            const dateString = (0, date_1.formatDate)(new Date(currentDate), 'M.DD');
            const count = (_b = (_a = result.find((r) => (0, date_1.formatDate)(new Date(r.date), 'M.DD') === dateString)) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0;
            if (count > 0) {
                dailyData.push({ date: dateString, value: Number(count) });
            }
            else {
                dailyData.push({ date: dateString, value: 0 });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dailyData;
    }
    async countMjDrawsByTimeRange(days) {
        var _a, _b;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
        const queryBuilder = this.midjourneyEntity.createQueryBuilder('midjourney');
        const result = await queryBuilder
            .select(`DATE(midjourney.createdAt) as date, COUNT(*) as count`)
            .where(`midjourney.status = :status`, { status: midjourney_constant_1.MidjourneyStatusEnum.DRAWED })
            .andWhere('midjourney.createdAt >= :startDate', { startDate })
            .groupBy('date')
            .orderBy('date')
            .getRawMany();
        const dailyData = [];
        const currentDate = startDate;
        for (let i = 0; i < days; i++) {
            const dateString = (0, date_1.formatDate)(new Date(currentDate), 'M.DD');
            const count = (_b = (_a = result.find((r) => (0, date_1.formatDate)(new Date(r.date), 'M.DD') === dateString)) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0;
            if (count > 0) {
                dailyData.push({ date: dateString, value: Number(count) });
            }
            else {
                dailyData.push({ date: dateString, value: 0 });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dailyData;
    }
    async getBaiduStatistics(days) {
        var _a, _b;
        const end_date = (0, date_1.formatDate)(new Date(), 'YYYYMMDD');
        const start_date = (0, date_1.formatDate)(new Date(Date.now() - Number(days - 1) * 24 * 60 * 60 * 1000), 'YYYYMMDD');
        const metrics = 'pv_count,visitor_count,ip_count,bounce_ratio,avg_visit_time';
        const method = 'overview/getTimeTrendRpt';
        const configInfo = await this.configEntity.find({ where: { configKey: (0, typeorm_2.In)(['baiduToken', 'baiduSiteId']) } });
        const siteId = (_a = configInfo.find((c) => c.configKey === 'baiduSiteId')) === null || _a === void 0 ? void 0 : _a.configVal;
        const accessToken = (_b = configInfo.find((c) => c.configKey === 'baiduToken')) === null || _b === void 0 ? void 0 : _b.configVal;
        if (!siteId || !accessToken) {
            return [];
        }
        if (!siteId) {
            throw new common_1.HttpException('请先配置百度统计siteId', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!accessToken) {
            throw new common_1.HttpException('请先配置百度统计accessToken', common_1.HttpStatus.BAD_REQUEST);
        }
        const url = `https://openapi.baidu.com/rest/2.0/tongji/report/getData?access_token=${accessToken}&site_id=${siteId}&method=${method}&start_date=${start_date}&end_date=${end_date}&metrics=${metrics}`;
        const res = await axios_1.default.get(url);
        const { error_code, message } = res.data;
        if (error_code === 111) {
            throw new common_1.HttpException(message || '百度授权码过期', common_1.HttpStatus.BAD_REQUEST);
        }
        if (error_code && error_code !== 200) {
            throw new common_1.HttpException(message || '获取百度统计数据失败', common_1.HttpStatus.BAD_REQUEST);
        }
        return res.data.result;
    }
    async countOrders() {
        const orderCount = await this.orderEntity.count();
        return orderCount;
    }
    async countNewOrdersToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const queryBuilder = this.orderEntity.createQueryBuilder('order');
        const orderCount = await queryBuilder
            .where('order.createdAt >= :today', { today })
            .andWhere('order.createdAt < :tomorrow', { tomorrow })
            .getCount();
        return orderCount;
    }
};
StatisticService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(chatLog_entity_1.ChatLogEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(order_entity_1.OrderEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(midjourney_entity_1.MidjourneyEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], StatisticService);
exports.StatisticService = StatisticService;
