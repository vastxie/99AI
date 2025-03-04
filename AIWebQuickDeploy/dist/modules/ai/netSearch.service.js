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
exports.netSearchService = void 0;
const common_1 = require("@nestjs/common");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let netSearchService = class netSearchService {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    async webSearchPro(prompt) {
        var _a, _b, _c, _d, _e, _f;
        try {
            const { pluginUrl, pluginKey } = await this.globalConfigService.getConfigs(['pluginUrl', 'pluginKey']);
            if (!pluginUrl || !pluginKey) {
                common_1.Logger.warn('搜索插件配置缺失');
                return { searchResults: [] };
            }
            const keys = pluginKey.split(',').filter((key) => key.trim());
            const selectedKey = keys[Math.floor(Math.random() * keys.length)];
            const isBochaiApi = pluginUrl.includes('bochaai.com');
            const isBigModelApi = pluginUrl.includes('bigmodel.cn');
            const isTavilyApi = pluginUrl.includes('tavily.com');
            common_1.Logger.log(`[搜索] API类型: ${isBochaiApi
                ? 'Bochai'
                : isBigModelApi
                    ? 'BigModel'
                    : isTavilyApi
                        ? 'Tavily'
                        : '未知'}`);
            common_1.Logger.log(`[搜索] 请求URL: ${pluginUrl}`);
            common_1.Logger.log(`[搜索] 搜索关键词: ${prompt}`);
            const requestBody = isBochaiApi
                ? {
                    query: prompt,
                    freshness: 'oneWeek',
                    summary: true,
                }
                : isTavilyApi
                    ? {
                        query: prompt,
                        search_depth: 'basic',
                        include_answer: false,
                        include_raw_content: false,
                        include_images: false,
                    }
                    : {
                        tool: 'web-search-pro',
                        stream: false,
                        messages: [{ role: 'user', content: prompt }],
                    };
            common_1.Logger.log(`[搜索] 请求参数: ${JSON.stringify(requestBody, null, 2)}`);
            const response = await fetch(pluginUrl, {
                method: 'POST',
                headers: {
                    Authorization: selectedKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                common_1.Logger.error(`[搜索] 接口返回错误: ${response.status}`);
                return { searchResults: [] };
            }
            const apiResult = await response.json();
            common_1.Logger.log(`[搜索] 原始返回数据: ${JSON.stringify(apiResult, null, 2)}`);
            let searchResults = [];
            if (isBochaiApi) {
                if ((apiResult === null || apiResult === void 0 ? void 0 : apiResult.code) === 200 && ((_b = (_a = apiResult === null || apiResult === void 0 ? void 0 : apiResult.data) === null || _a === void 0 ? void 0 : _a.webPages) === null || _b === void 0 ? void 0 : _b.value)) {
                    searchResults = apiResult.data.webPages.value.map((item) => ({
                        title: (item === null || item === void 0 ? void 0 : item.name) || '',
                        link: (item === null || item === void 0 ? void 0 : item.url) || '',
                        content: (item === null || item === void 0 ? void 0 : item.summary) || '',
                        icon: (item === null || item === void 0 ? void 0 : item.siteIcon) || '',
                        media: (item === null || item === void 0 ? void 0 : item.siteName) || '',
                    }));
                }
            }
            else if (isBigModelApi) {
                if (((_f = (_e = (_d = (_c = apiResult === null || apiResult === void 0 ? void 0 : apiResult.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.tool_calls) === null || _f === void 0 ? void 0 : _f.length) > 0) {
                    for (const toolCall of apiResult.choices[0].message.tool_calls) {
                        if (Array.isArray(toolCall.search_result)) {
                            searchResults = toolCall.search_result.map((item) => ({
                                title: (item === null || item === void 0 ? void 0 : item.title) || '',
                                link: (item === null || item === void 0 ? void 0 : item.link) || '',
                                content: (item === null || item === void 0 ? void 0 : item.content) || '',
                                icon: (item === null || item === void 0 ? void 0 : item.icon) || '',
                                media: (item === null || item === void 0 ? void 0 : item.media) || '',
                            }));
                            break;
                        }
                    }
                }
            }
            else if (isTavilyApi) {
                if (Array.isArray(apiResult === null || apiResult === void 0 ? void 0 : apiResult.results)) {
                    searchResults = apiResult.results.map((item) => ({
                        title: (item === null || item === void 0 ? void 0 : item.title) || '',
                        link: (item === null || item === void 0 ? void 0 : item.url) || '',
                        content: (item === null || item === void 0 ? void 0 : item.content) || '',
                        icon: '',
                        media: '',
                    }));
                }
            }
            const formattedResult = searchResults.map((item, index) => (Object.assign({ resultIndex: index + 1 }, item)));
            common_1.Logger.log(`[搜索] 格式化后的结果: ${JSON.stringify(formattedResult, null, 2)}`);
            return { searchResults: formattedResult };
        }
        catch (fetchError) {
            common_1.Logger.error('[搜索] 调用接口出错:', fetchError);
            return { searchResults: [] };
        }
    }
};
netSearchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], netSearchService);
exports.netSearchService = netSearchService;
