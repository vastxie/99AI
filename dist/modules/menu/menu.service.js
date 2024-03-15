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
exports.MenuService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const menu_entity_1 = require("./menu.entity");
let MenuService = class MenuService {
    constructor(menuEntity) {
        this.menuEntity = menuEntity;
    }
    async onModuleInit() {
        await this.initMenu();
    }
    async initMenu() {
        const menuCount = await this.menuEntity.count();
        if (menuCount > 0)
            return;
        const pcMenuData = [
            { menuTipText: '对话聊天', menuIcon: 'ri:message-3-line', menuName: 'Chat', menuPath: '/chat', menuType: 0, menuPlatform: 1, order: 100 },
            { menuTipText: '应用广场', menuIcon: 'ant-design:appstore-outlined', menuName: 'AppStore', menuPath: '/app-store', menuType: 0, menuPlatform: 1, order: 200 },
            { menuTipText: '专业绘画', menuIcon: 'ri:landscape-line', menuName: 'Midjourney', menuPath: '/midjourney', menuType: 0, menuPlatform: 1, order: 300 },
            { menuTipText: '绘画广场', menuIcon: 'solar:album-line-duotone', menuName: 'Market', menuPath: '/market', menuType: 0, menuPlatform: 1, order: 400 },
            { menuTipText: '思维导图', menuIcon: 'icon-park-outline:mindmap-map', menuName: 'Mind', menuPath: '/mind', menuType: 0, menuPlatform: 1, order: 600 },
            { menuTipText: '会员中心', menuIcon: 'icon-park-outline:shopping', menuName: 'Pay', menuPath: '/pay', menuType: 0, menuPlatform: 1, order: 700 },
            { menuTipText: '推广计划', menuIcon: 'uiw:share', menuName: 'Share', menuPath: '/share', menuType: 0, menuPlatform: 1, order: 800 },
        ];
        const mobileMenuData = [
            { menuTipText: '对话聊天', menuIcon: 'ri:message-3-line', menuName: 'Chat', menuPath: '/chat', menuType: 0, menuPlatform: 0, order: 100 },
            { menuTipText: '应用广场', menuIcon: 'ant-design:appstore-outlined', menuName: 'AppStore', menuPath: '/app-store', menuType: 0, menuPlatform: 0, order: 200 },
            { menuTipText: '专业绘画', menuIcon: 'ri:landscape-line', menuName: 'Midjourney', menuPath: '/midjourney', menuType: 0, menuPlatform: 0, order: 300 },
            { menuTipText: '思维导图', menuIcon: 'icon-park-outline:mindmap-map', menuName: 'Mind', menuPath: '/mind', menuType: 0, menuPlatform: 0, order: 400 },
            { menuTipText: '个人中心', menuIcon: 'ri:account-pin-box-line', menuName: 'UserCenter', menuPath: '/user-center', menuType: 0, menuPlatform: 0, order: 500 },
        ];
        const initMenuData = [...pcMenuData, ...mobileMenuData];
        await this.menuEntity.save(initMenuData);
    }
    async queryMenu(query) {
        const { menuPlatform } = query;
        let where = {};
        menuPlatform && (where.menuPlatform = menuPlatform);
        return await this.menuEntity.find({ where, order: { order: 'ASC' } });
    }
    async menuListFront(query) {
        const { menuPlatform } = query;
        let where = {
            isShow: true
        };
        menuPlatform && (where.menuPlatform = menuPlatform);
        return await this.menuEntity.find({ where, order: { order: 'ASC' } });
    }
    async visibleMenu(params) {
        const { id } = params;
        if (!id)
            return;
        const m = await this.menuEntity.findOne({ where: { id } });
        if (!m)
            return;
        const { isShow } = m;
        const res = await this.menuEntity.update({ id }, { isShow: !isShow });
        return res.affected > 0;
    }
    async setMenu(params) {
        const { id } = params;
        if (params.isSystem) {
            params.menuPath = '';
        }
        else {
            params.menuIframeUrl = '';
        }
        delete params.isSystem;
        try {
            if (id) {
                const res = await this.menuEntity.update({ id }, params);
                return res.affected > 0;
            }
            else {
                const res = await this.menuEntity.save(params);
                return res;
            }
        }
        catch (error) {
            throw new common_1.HttpException('操作菜单失败!', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async delMenu(params) {
        const { id } = params;
        if (!id) {
            throw new common_1.HttpException('缺失必要参数!', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.menuEntity.delete({ id });
        return res;
    }
    async updateIcon(params) {
        const { id, menuIcon, menuTipText, order } = params;
        if (!id || !menuIcon || !menuTipText || !order) {
            throw new common_1.HttpException('缺失必要参数!', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.menuEntity.update({ id }, { menuIcon, menuTipText, order });
        return res.affected > 0;
    }
};
MenuService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(menu_entity_1.MenuEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], MenuService);
exports.MenuService = MenuService;
