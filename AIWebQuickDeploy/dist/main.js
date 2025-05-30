/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TypeOrmQueryFailedFilter = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(3);
let TypeOrmQueryFailedFilter = class TypeOrmQueryFailedFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        if (exception.code === 'ER_DUP_ENTRY') {
            throw new common_1.BadRequestException('该记录已经存在，请勿重复添加！');
        }
        else {
            console.log('other query error');
        }
        response.status(500).json({
            statusCode: 500,
            timestamp: new Date().toISOString(),
            path: request.url,
            message: `Database query failed: ${exception.message}`,
        });
    }
};
exports.TypeOrmQueryFailedFilter = TypeOrmQueryFailedFilter;
exports.TypeOrmQueryFailedFilter = TypeOrmQueryFailedFilter = __decorate([
    (0, common_1.Catch)(typeorm_1.QueryFailedError)
], TypeOrmQueryFailedFilter);


/***/ }),
/* 2 */
/***/ ((module) => {

module.exports = require("@nestjs/common");

/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("typeorm");

/***/ }),
/* 4 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TransformInterceptor = void 0;
const result_1 = __webpack_require__(5);
const common_1 = __webpack_require__(2);
const rxjs_1 = __webpack_require__(6);
const operators_1 = __webpack_require__(7);
let TransformInterceptor = class TransformInterceptor {
    intercept(context, next) {
        return next.handle().pipe((0, operators_1.map)(data => {
            const response = context.switchToHttp().getResponse();
            const request = context.switchToHttp().getRequest();
            response.statusCode = 200;
            if (request.path.includes('notify')) {
                return data;
            }
            const message = response.status < 400 ? null : response.statusText;
            return result_1.Result.success(data, message);
        }), (0, rxjs_1.catchError)(error => {
            const statusCode = error.status || 500;
            const message = (error.response || 'Internal server error');
            return (0, rxjs_1.throwError)(new common_1.HttpException(message, statusCode));
        }));
    }
};
exports.TransformInterceptor = TransformInterceptor;
exports.TransformInterceptor = TransformInterceptor = __decorate([
    (0, common_1.Injectable)()
], TransformInterceptor);


/***/ }),
/* 5 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Result = void 0;
class Result {
    code;
    data;
    success;
    message;
    constructor(code, success, data, message) {
        this.code = code;
        this.data = data;
        this.success = success;
        this.message = message;
    }
    static success(data, message = '请求成功') {
        return new Result(200, true, data, message);
    }
    static fail(code, message = '请求失败', data) {
        return new Result(code, false, data, message);
    }
}
exports.Result = Result;


/***/ }),
/* 6 */
/***/ ((module) => {

module.exports = require("rxjs");

/***/ }),
/* 7 */
/***/ ((module) => {

module.exports = require("rxjs/operators");

/***/ }),
/* 8 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CustomLoggerService = void 0;
const common_1 = __webpack_require__(2);
const util_1 = __webpack_require__(9);
let CustomLoggerService = class CustomLoggerService extends common_1.ConsoleLogger {
    isDev;
    constructor() {
        super();
        this.isDev = process.env.ISDEV === 'true';
    }
    sanitizeLogMessage(message) {
        if (message === null || message === undefined) {
            return String(message);
        }
        if (typeof message === 'object') {
            try {
                if (Array.isArray(message)) {
                    const sanitizedArray = [...message];
                    this.sanitizeDeep(sanitizedArray);
                    return util_1.default.inspect(sanitizedArray, { depth: null, maxArrayLength: null });
                }
                else {
                    const clone = JSON.parse(JSON.stringify(message));
                    this.sanitizeDeep(clone);
                    return util_1.default.inspect(clone, { depth: null, maxArrayLength: null });
                }
            }
            catch (e) {
                try {
                    return this.sanitizeBase64String(util_1.default.inspect(message, { depth: null }));
                }
                catch (err) {
                    return '[无法序列化的对象]';
                }
            }
        }
        if (typeof message === 'string') {
            return this.sanitizeBase64String(message);
        }
        return this.sanitizeBase64String(String(message));
    }
    sanitizeDeep(obj) {
        if (!obj || typeof obj !== 'object')
            return;
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const value = obj[i];
                if (typeof value === 'string') {
                    obj[i] = this.sanitizeBase64String(value);
                }
                else if (value && typeof value === 'object') {
                    this.sanitizeDeep(value);
                }
            }
            return;
        }
        for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (typeof value === 'string') {
                obj[key] = this.sanitizeBase64String(value);
            }
            else if (value && typeof value === 'object') {
                this.sanitizeDeep(value);
            }
        }
    }
    sanitizeBase64String(str) {
        if (!str)
            return str;
        str = str.replace(/(data:[^;]+;base64,)[a-zA-Z0-9+/=]{20,}/g, '$1***BASE64_DATA***');
        str = str.replace(/([a-zA-Z0-9+/=]{50})[a-zA-Z0-9+/=]{10,}/g, '$1***BASE64_DATA***');
        str = str.replace(/"([a-zA-Z0-9+/=]{20,})"/g, function (match, p1) {
            if (p1.length >= 50 && /^[a-zA-Z0-9+/=]+$/.test(p1)) {
                return '"' + p1.substring(0, 20) + '***BASE64_DATA***"';
            }
            return match;
        });
        str = str.replace(/("url"\s*:\s*")([a-zA-Z0-9+/=]{20,})(")/g, '$1***BASE64_DATA***$3');
        return str;
    }
    log(message, context) {
        const sanitized = this.sanitizeLogMessage(message);
        super.log(sanitized, context);
    }
    error(message, trace, context) {
        const sanitized = this.sanitizeLogMessage(message);
        super.error(sanitized, trace, context);
    }
    warn(message, context) {
        if (this.isDev) {
            const sanitized = this.sanitizeLogMessage(message);
            super.warn(sanitized, context);
        }
    }
    debug(message, context) {
        if (this.isDev) {
            const sanitized = this.sanitizeLogMessage(message);
            super.debug(sanitized, context);
        }
    }
    verbose(message, context) {
        if (this.isDev) {
            const sanitized = this.sanitizeLogMessage(message);
            super.verbose(sanitized, context);
        }
    }
};
exports.CustomLoggerService = CustomLoggerService;
exports.CustomLoggerService = CustomLoggerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], CustomLoggerService);


/***/ }),
/* 9 */
/***/ ((module) => {

module.exports = require("util");

/***/ }),
/* 10 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FastXmlMiddleware = void 0;
const common_1 = __webpack_require__(2);
const fast_xml_parser_1 = __webpack_require__(11);
const getRawBody = __webpack_require__(12);
let FastXmlMiddleware = class FastXmlMiddleware {
    xmlParser;
    constructor() {
        this.xmlParser = new fast_xml_parser_1.XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            allowBooleanAttributes: true,
            parseAttributeValue: true,
            trimValues: true,
            isArray: name => {
                return true;
            },
        });
    }
    use(req, res, next) {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('application/xml') && !contentType.includes('text/xml')) {
            return next();
        }
        common_1.Logger.debug(`收到XML请求 - Content-Type: ${contentType}`, 'FastXmlMiddleware');
        getRawBody(req, {
            length: req.headers['content-length'],
            limit: '1mb',
            encoding: true,
        })
            .then(rawBody => {
            common_1.Logger.debug(`原始XML内容: ${rawBody}`, 'FastXmlMiddleware');
            try {
                const parsedXml = this.xmlParser.parse(rawBody);
                common_1.Logger.debug(`XML解析结果: ${JSON.stringify(parsedXml, null, 2)}`, 'FastXmlMiddleware');
                req.body = parsedXml.xml ? { xml: parsedXml.xml } : parsedXml;
                common_1.Logger.debug(`解析后的req.body结构已设置`, 'FastXmlMiddleware');
                next();
            }
            catch (parseError) {
                common_1.Logger.error(`XML解析错误: ${parseError.message}`, 'FastXmlMiddleware');
                next(parseError);
            }
        })
            .catch(error => {
            common_1.Logger.error(`获取请求体错误: ${error.message}`, 'FastXmlMiddleware');
            next(error);
        });
    }
};
exports.FastXmlMiddleware = FastXmlMiddleware;
exports.FastXmlMiddleware = FastXmlMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], FastXmlMiddleware);


/***/ }),
/* 11 */
/***/ ((module) => {

module.exports = require("fast-xml-parser");

/***/ }),
/* 12 */
/***/ ((module) => {

module.exports = require("raw-body");

/***/ }),
/* 13 */
/***/ ((module) => {

module.exports = require("@nestjs/core");

/***/ }),
/* 14 */
/***/ ((module) => {

module.exports = require("@nestjs/swagger");

/***/ }),
/* 15 */
/***/ ((module) => {

module.exports = require("compression");

/***/ }),
/* 16 */
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),
/* 17 */
/***/ ((module) => {

module.exports = require("dotenv");

/***/ }),
/* 18 */
/***/ ((module) => {

module.exports = require("fs");

/***/ }),
/* 19 */
/***/ ((module) => {

module.exports = require("ioredis");

/***/ }),
/* 20 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 21 */
/***/ ((module) => {

module.exports = require("reflect-metadata");

/***/ }),
/* 22 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppModule = void 0;
const abort_interceptor_1 = __webpack_require__(23);
const custom_logger_service_1 = __webpack_require__(8);
const rate_limit_module_1 = __webpack_require__(25);
const common_1 = __webpack_require__(2);
const core_1 = __webpack_require__(13);
const serve_static_1 = __webpack_require__(31);
const path_1 = __webpack_require__(20);
const app_module_1 = __webpack_require__(32);
const auth_module_1 = __webpack_require__(119);
const autoReply_module_1 = __webpack_require__(133);
const badWords_module_1 = __webpack_require__(141);
const chat_module_1 = __webpack_require__(151);
const chatGroup_module_1 = __webpack_require__(171);
const chatLog_module_1 = __webpack_require__(176);
const crami_module_1 = __webpack_require__(187);
const database_module_1 = __webpack_require__(199);
const globalConfig_module_1 = __webpack_require__(204);
const models_module_1 = __webpack_require__(208);
const official_module_1 = __webpack_require__(214);
const order_module_1 = __webpack_require__(219);
const pay_module_1 = __webpack_require__(226);
const plugin_module_1 = __webpack_require__(228);
const redisCache_module_1 = __webpack_require__(26);
const share_module_1 = __webpack_require__(231);
const signin_module_1 = __webpack_require__(234);
const spa_module_1 = __webpack_require__(237);
const statistic_module_1 = __webpack_require__(239);
const task_module_1 = __webpack_require__(243);
const upload_module_1 = __webpack_require__(246);
const user_module_1 = __webpack_require__(122);
const userBalance_module_1 = __webpack_require__(249);
const verification_module_1 = __webpack_require__(251);
let AppModule = class AppModule {
    configure(consumer) {
        consumer;
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            rate_limit_module_1.RateLimitModule,
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'public/admin'),
                serveRoot: process.env.ADMIN_SERVE_ROOT || '/admin',
            }, {
                rootPath: (0, path_1.join)(__dirname, '..', 'public/file'),
                serveRoot: '/file',
                serveStaticOptions: {
                    setHeaders: (_res, _path, _stat) => {
                        _res.set('Access-Control-Allow-Origin', '*');
                    },
                },
            }, {
                rootPath: (0, path_1.join)(__dirname, '..', 'public/chat'),
                serveRoot: '/',
                serveStaticOptions: {
                    index: false,
                    fallthrough: true,
                    redirect: false,
                    extensions: ['html', 'htm'],
                    setHeaders: (_res, _path, _stat) => {
                        if (_path.endsWith('.js')) {
                            _res.set('Content-Type', 'application/javascript');
                        }
                        else if (_path.endsWith('.css')) {
                            _res.set('Content-Type', 'text/css');
                        }
                    },
                },
            }),
            user_module_1.UserModule,
            plugin_module_1.PluginModule,
            auth_module_1.AuthModule,
            verification_module_1.VerificationModule,
            chat_module_1.ChatModule,
            app_module_1.AppModule,
            crami_module_1.CramiModule,
            userBalance_module_1.UserBalanceModule,
            chatLog_module_1.ChatLogModule,
            upload_module_1.UploadModule,
            redisCache_module_1.RedisCacheModule,
            globalConfig_module_1.GlobalConfigModule,
            statistic_module_1.StatisticModule,
            badWords_module_1.BadWordsModule,
            autoReply_module_1.AutoReplyModule,
            pay_module_1.PayModule,
            order_module_1.OrderModule,
            official_module_1.OfficialModule,
            task_module_1.TaskModule,
            chatGroup_module_1.ChatGroupModule,
            signin_module_1.SigninModule,
            models_module_1.ModelsModule,
            share_module_1.ShareModule,
            spa_module_1.SpaModule,
        ],
        providers: [
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: abort_interceptor_1.AbortInterceptor,
            },
            custom_logger_service_1.CustomLoggerService,
        ],
        exports: [custom_logger_service_1.CustomLoggerService],
    })
], AppModule);


/***/ }),
/* 23 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AbortInterceptor = void 0;
const common_1 = __webpack_require__(2);
const abort_controller_1 = __webpack_require__(24);
let AbortInterceptor = class AbortInterceptor {
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const abortController = new abort_controller_1.AbortController();
        request.abortController = abortController;
        return next.handle();
    }
};
exports.AbortInterceptor = AbortInterceptor;
exports.AbortInterceptor = AbortInterceptor = __decorate([
    (0, common_1.Injectable)()
], AbortInterceptor);


/***/ }),
/* 24 */
/***/ ((module) => {

module.exports = require("abort-controller");

/***/ }),
/* 25 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RateLimitModule = void 0;
const common_1 = __webpack_require__(2);
const redisCache_module_1 = __webpack_require__(26);
const rate_limit_middleware_1 = __webpack_require__(29);
const rate_limit_service_1 = __webpack_require__(30);
let RateLimitModule = class RateLimitModule {
    rateLimitService;
    constructor(rateLimitService) {
        this.rateLimitService = rateLimitService;
    }
    async onModuleInit() {
        this.rateLimitService.getConfigs();
    }
    configure(consumer) {
        consumer.apply(rate_limit_middleware_1.RateLimitMiddleware).forRoutes('*');
    }
};
exports.RateLimitModule = RateLimitModule;
exports.RateLimitModule = RateLimitModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [redisCache_module_1.RedisCacheModule],
        providers: [rate_limit_service_1.RateLimitService, rate_limit_middleware_1.RateLimitMiddleware],
        exports: [rate_limit_service_1.RateLimitService],
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof rate_limit_service_1.RateLimitService !== "undefined" && rate_limit_service_1.RateLimitService) === "function" ? _a : Object])
], RateLimitModule);


/***/ }),
/* 26 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RedisCacheModule = void 0;
const common_1 = __webpack_require__(2);
const redis_1 = __webpack_require__(27);
const redisCache_service_1 = __webpack_require__(28);
let RedisCacheModule = class RedisCacheModule {
};
exports.RedisCacheModule = RedisCacheModule;
exports.RedisCacheModule = RedisCacheModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [],
        providers: [
            {
                provide: 'REDIS_CLIENT',
                useFactory: async () => {
                    const host = process.env.REDIS_HOST;
                    const port = parseInt(process.env.REDIS_PORT, 10);
                    const password = process.env.REDIS_PASSWORD;
                    const username = process.env.REDIS_USER;
                    const database = parseInt(process.env.REDIS_DB, 10) || 0;
                    if (!host || !port) {
                        common_1.Logger.error(`Please configure Redis config | 未配置 Redis 配置信息，请确认配置 Redis 服务以获得更好的体验`, 'RedisCacheModule');
                        return;
                    }
                    const client = (0, redis_1.createClient)({
                        socket: {
                            host,
                            port,
                        },
                        username,
                        password,
                        database,
                    });
                    client.on('ready', () => {
                        common_1.Logger.log(`Redis connection successful`, 'RedisCacheModule');
                    });
                    client.on('error', err => {
                        common_1.Logger.error(`Redis connection failed: ${err}`, 'RedisCacheModule');
                    });
                    await client.connect();
                    return client;
                },
            },
            redisCache_service_1.RedisCacheService,
        ],
        exports: ['REDIS_CLIENT', redisCache_service_1.RedisCacheService],
    })
], RedisCacheModule);


/***/ }),
/* 27 */
/***/ ((module) => {

module.exports = require("redis");

/***/ }),
/* 28 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RedisCacheService = void 0;
const common_1 = __webpack_require__(2);
const redis_1 = __webpack_require__(27);
let RedisCacheService = class RedisCacheService {
    redisClient;
    constructor(redisClient) {
        this.redisClient = redisClient;
    }
    async get(body) {
        const { key } = body;
        const res = await this.redisClient.get(key);
        return await this.redisClient.get(key);
    }
    async set(body, timeout = 3600) {
        const { key, val } = body;
        return await this.redisClient.set(key, val, { EX: timeout });
    }
    async getJwtSecret() {
        const secret = await this.redisClient.get('JWT_SECRET');
        if (!secret) {
            throw new Error('JWT secret not found in Redis');
        }
        return secret;
    }
    async ttl(key) {
        return await this.redisClient.ttl(key);
    }
    async del(body) {
        const { key } = body;
        await this.redisClient.del(key);
        return;
    }
    async saveToken(userId, token) {
        const maxDevices = 2;
        let tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
        if (tokens.includes(token)) {
            await this.redisClient.zRem(`tokens:${userId}`, token);
            tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
        }
        while (tokens.length >= maxDevices) {
            const oldestToken = await this.redisClient.zRange(`tokens:${userId}`, 0, 0);
            if (oldestToken.length > 0) {
                await this.redisClient.zRem(`tokens:${userId}`, oldestToken[0]);
                tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
            }
            else {
                break;
            }
        }
        await this.redisClient.zAdd(`tokens:${userId}`, [
            {
                score: Date.now(),
                value: token,
            },
        ]);
    }
    async invalidateTokens(userId, tokens) {
        tokens.forEach(token => {
            this.redisClient.del(`token:${userId}:${token}`);
            this.redisClient.zRem(`tokens:${userId}`, token);
        });
    }
    async checkTokenAuth(token, req) {
        const { id: userId, role } = req.user;
        const maxDevices = 2;
        if (role === 'visitor')
            return true;
        if (['super', 'admin'].includes(role))
            return true;
        let tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
        if (!tokens.includes(token)) {
            throw new common_1.HttpException('您的登录已失效（可能由于其他设备登录），请重新登录！', common_1.HttpStatus.UNAUTHORIZED);
        }
        while (tokens.length > maxDevices) {
            const oldestToken = await this.redisClient.zRange(`tokens:${userId}`, 0, 0);
            if (oldestToken.length > 0 && oldestToken[0] !== token) {
                await this.redisClient.zRem(`tokens:${userId}`, oldestToken[0]);
                tokens = await this.redisClient.zRange(`tokens:${userId}`, 0, -1);
            }
            else {
                break;
            }
        }
        return true;
    }
    async keys(pattern) {
        try {
            const keys = await this.redisClient.keys(pattern);
            return keys;
        }
        catch (error) {
            console.error(`Error getting keys with pattern ${pattern}:`, error);
            return [];
        }
    }
};
exports.RedisCacheService = RedisCacheService;
exports.RedisCacheService = RedisCacheService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [typeof (_a = typeof redis_1.RedisClientType !== "undefined" && redis_1.RedisClientType) === "function" ? _a : Object])
], RedisCacheService);


/***/ }),
/* 29 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RateLimitMiddleware = void 0;
const common_1 = __webpack_require__(2);
const redisCache_service_1 = __webpack_require__(28);
const rate_limit_service_1 = __webpack_require__(30);
let RateLimitMiddleware = class RateLimitMiddleware {
    redisCacheService;
    rateLimitService;
    constructor(redisCacheService, rateLimitService) {
        this.redisCacheService = redisCacheService;
        this.rateLimitService = rateLimitService;
    }
    async onModuleInit() {
        this.rateLimitService.getConfigs();
    }
    async use(req, res, next) {
        try {
            const path = req.path;
            const configs = this.rateLimitService.getConfigs();
            const matchedConfig = this.findMatchingConfig(path, configs);
            if (!matchedConfig) {
                return next();
            }
            const ip = req.ip || req.socket.remoteAddress;
            const identifier = ip || 'unknown';
            const redisKey = `rate-limit:${matchedConfig.path}:${identifier}`;
            const result = await this.redisCacheService.get({ key: redisKey });
            let currentCount = result ? parseInt(result, 10) : 0;
            currentCount++;
            const windowSeconds = Math.floor(matchedConfig.windowMs / 1000);
            await this.redisCacheService.set({ key: redisKey, val: currentCount.toString() }, windowSeconds);
            res.setHeader('X-RateLimit-Limit', matchedConfig.maxRequests.toString());
            res.setHeader('X-RateLimit-Remaining', Math.max(0, matchedConfig.maxRequests - currentCount).toString());
            res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() + matchedConfig.windowMs).toString());
            res.setHeader('X-RateLimit-Config-Path', matchedConfig.path);
            if (currentCount > matchedConfig.maxRequests) {
                common_1.Logger.warn(`限流: IP=${identifier}, 路径=${path}, 计数=${currentCount}/${matchedConfig.maxRequests}`, 'RateLimitMiddleware');
                res.status(429).json({
                    code: 1,
                    message: '请求频率超过限制，请稍后再试',
                    data: null,
                });
                return;
            }
            next();
        }
        catch (error) {
            common_1.Logger.error(`中间件错误: ${error.message}`, error.stack, 'RateLimitMiddleware');
            next();
        }
    }
    findMatchingConfig(requestPath, configs) {
        for (const config of configs) {
            const isMatch = this.pathMatch(config.path, requestPath);
            if (isMatch) {
                return config;
            }
        }
        return null;
    }
    pathMatch(pattern, path) {
        if (pattern === path) {
            return true;
        }
        if (pattern.includes('*')) {
            try {
                const escapedPattern = pattern
                    .replace(/\./g, '\\.')
                    .replace(/\//g, '\\/')
                    .replace(/\*\*/g, '.*')
                    .replace(/\*/g, '[^\\/]*');
                const regexPattern = new RegExp(`^${escapedPattern}$`);
                return regexPattern.test(path);
            }
            catch (error) {
                common_1.Logger.error(`路径匹配错误: ${error.message}`, error.stack, 'RateLimitMiddleware');
                return false;
            }
        }
        return false;
    }
};
exports.RateLimitMiddleware = RateLimitMiddleware;
exports.RateLimitMiddleware = RateLimitMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof redisCache_service_1.RedisCacheService !== "undefined" && redisCache_service_1.RedisCacheService) === "function" ? _a : Object, typeof (_b = typeof rate_limit_service_1.RateLimitService !== "undefined" && rate_limit_service_1.RateLimitService) === "function" ? _b : Object])
], RateLimitMiddleware);


/***/ }),
/* 30 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RateLimitService = void 0;
const common_1 = __webpack_require__(2);
let RateLimitService = class RateLimitService {
    configs = [];
    constructor() {
        this.initializeConfigs();
    }
    async onModuleInit() { }
    initializeConfigs() {
        this.addConfig({
            path: '/api/upload/file',
            maxRequests: 100,
            windowMs: 60 * 60 * 1000,
        });
        this.addConfig({
            path: '/api/chatgpt/chat-process',
            maxRequests: 1000,
            windowMs: 60 * 60 * 1000,
        });
        this.addConfig({
            path: '/api/pay',
            maxRequests: 600,
            windowMs: 60 * 60 * 1000,
        });
        this.addConfig({
            path: '/api/*',
            maxRequests: 3600,
            windowMs: 60 * 60 * 1000,
        });
    }
    getConfigs() {
        return this.configs;
    }
    addConfig(config) {
        if (config.path && !config.path.startsWith('/')) {
            config.path = `/${config.path}`;
        }
        const existingIndex = this.configs.findIndex(c => c.path === config.path);
        if (existingIndex >= 0) {
            this.configs[existingIndex] = { ...config };
        }
        else {
            this.configs.push({ ...config });
        }
        this.sortConfigs();
    }
    sortConfigs() {
        this.configs.sort((a, b) => {
            const aIsWildcard = a.path.includes('*');
            const bIsWildcard = b.path.includes('*');
            if (aIsWildcard && !bIsWildcard) {
                return 1;
            }
            if (!aIsWildcard && bIsWildcard) {
                return -1;
            }
            return b.path.length - a.path.length;
        });
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RateLimitService);


/***/ }),
/* 31 */
/***/ ((module) => {

module.exports = require("@nestjs/serve-static");

/***/ }),
/* 32 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const userBalance_service_1 = __webpack_require__(34);
const app_controller_1 = __webpack_require__(85);
const app_entity_1 = __webpack_require__(106);
const app_service_1 = __webpack_require__(105);
const appCats_entity_1 = __webpack_require__(107);
const userApps_entity_1 = __webpack_require__(108);
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([appCats_entity_1.AppCatsEntity, app_entity_1.AppEntity, userApps_entity_1.UserAppsEntity])],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService, userBalance_service_1.UserBalanceService],
    })
], AppModule);


/***/ }),
/* 33 */
/***/ ((module) => {

module.exports = require("@nestjs/typeorm");

/***/ }),
/* 34 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserBalanceService = void 0;
const balance_constant_1 = __webpack_require__(35);
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const cramiPackage_entity_1 = __webpack_require__(71);
const config_entity_1 = __webpack_require__(73);
const globalConfig_service_1 = __webpack_require__(74);
const accountLog_entity_1 = __webpack_require__(79);
const balance_entity_1 = __webpack_require__(80);
const userBalance_entity_1 = __webpack_require__(81);
const date_1 = __webpack_require__(47);
const chatGroup_entity_1 = __webpack_require__(82);
const chatLog_entity_1 = __webpack_require__(75);
const user_entity_1 = __webpack_require__(83);
const fingerprint_entity_1 = __webpack_require__(84);
let UserBalanceService = class UserBalanceService {
    balanceEntity;
    userBalanceEntity;
    accountLogEntity;
    cramiPackageEntity;
    configEntity;
    userEntity;
    fingerprintLogEntity;
    chatGroupEntity;
    chatLogEntity;
    globalConfigService;
    constructor(balanceEntity, userBalanceEntity, accountLogEntity, cramiPackageEntity, configEntity, userEntity, fingerprintLogEntity, chatGroupEntity, chatLogEntity, globalConfigService) {
        this.balanceEntity = balanceEntity;
        this.userBalanceEntity = userBalanceEntity;
        this.accountLogEntity = accountLogEntity;
        this.cramiPackageEntity = cramiPackageEntity;
        this.configEntity = configEntity;
        this.userEntity = userEntity;
        this.fingerprintLogEntity = fingerprintLogEntity;
        this.chatGroupEntity = chatGroupEntity;
        this.chatLogEntity = chatLogEntity;
        this.globalConfigService = globalConfigService;
    }
    async addBalanceToNewUser(userId) {
        try {
            const registerConfigs = await this.configEntity.find({
                where: {
                    configKey: (0, typeorm_2.In)([
                        'registerSendStatus',
                        'registerSendModel3Count',
                        'registerSendModel4Count',
                        'registerSendDrawMjCount',
                        'firstRegisterSendStatus',
                        'firstRegisterSendRank',
                        'firstRegisterSendModel3Count',
                        'firstRegisterSendModel4Count',
                        'firstRegisterSendDrawMjCount',
                    ]),
                },
            });
            const configMap = registerConfigs.reduce((pre, cur) => {
                const num = Number(cur.configVal);
                const n = Number.isInteger(num) && num > 0 ? num : 0;
                pre[cur.configKey] = n;
                return pre;
            }, {});
            let model3Count = 0;
            let model4Count = 0;
            let drawMjCount = 0;
            if (configMap.registerSendStatus === 1) {
                model3Count = model3Count + configMap.registerSendModel3Count;
                model4Count = model4Count + configMap.registerSendModel4Count;
                drawMjCount = drawMjCount + configMap.registerSendDrawMjCount;
            }
            if (configMap.registerSendStatus === 1 &&
                configMap.firstRegisterSendStatus === 1 &&
                userId <= configMap.firstRegisterSendRank) {
                model3Count = model3Count + configMap.firstRegisterSendModel3Count;
                model4Count = model4Count + configMap.firstRegisterSendModel4Count;
                drawMjCount = drawMjCount + configMap.firstRegisterSendDrawMjCount;
            }
            await this.saveRecordRechargeLog({
                userId,
                rechargeType: balance_constant_1.RechargeType.REG_GIFT,
                model3Count,
                drawMjCount,
                model4Count,
            });
            await this.userBalanceEntity.save({
                userId,
                model3Count,
                model4Count,
                drawMjCount,
                useTokens: 0,
            });
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('注册赠送失败,请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async validateBalance(req, type, amount) {
        const { id: userId, role } = req.user;
        let b = await this.userBalanceEntity.findOne({ where: { userId } });
        if (!b) {
            b = await this.createBaseUserBalance(userId);
        }
        if (role === 'visitor') {
            return this.validateVisitorBalance(req, type, amount);
        }
        const memberKey = type === 1
            ? 'memberModel3Count'
            : type === 2
                ? 'memberModel4Count'
                : type === 3
                    ? 'memberDrawMjCount'
                    : null;
        const baseKey = type === 1 ? 'model3Count' : type === 2 ? 'model4Count' : type === 3 ? 'drawMjCount' : null;
        if (b.packageId && b[memberKey] + b[baseKey] < amount) {
            if (b[baseKey] < amount) {
                throw new common_1.HttpException(`积分不足，继续体验服务，请按需选购套餐！`, common_1.HttpStatus.PAYMENT_REQUIRED);
            }
        }
        if (!b.packageId && b[baseKey] < amount) {
            throw new common_1.HttpException(`积分不足，继续体验服务，请按需选购套餐！`, common_1.HttpStatus.PAYMENT_REQUIRED);
        }
        return b;
    }
    async validateVisitorBalance(req, type, amount) {
        const { id } = req.user;
        const baseKey = type === 1 ? 'model3Count' : type === 2 ? 'model4Count' : type === 3 ? 'drawMjCount' : null;
        const now = new Date();
        const log = await this.fingerprintLogEntity.findOne({
            where: { fingerprint: id },
        });
        const { visitorModel3Num, visitorModel4Num, visitorMJNum } = await this.globalConfigService.getConfigs([
            'visitorModel3Num',
            'visitorModel4Num',
            'visitorMJNum',
        ]);
        const settings = {
            model3Count: visitorModel3Num ? Number(visitorModel3Num) : 0,
            model4Count: visitorModel4Num ? Number(visitorModel4Num) : 0,
            drawMjCount: visitorMJNum ? Number(visitorMJNum) : 0,
        };
        if (!log) {
            const data = {
                fingerprint: id,
                model3Count: 0,
                model4Count: 0,
                drawMjCount: 0,
            };
            data[baseKey] = data[baseKey] + amount;
            if (data[baseKey] > settings[baseKey]) {
                throw new common_1.HttpException(`今日体验额度使用完毕，请注册使用完整服务！`, common_1.HttpStatus.PAYMENT_REQUIRED);
            }
            else {
                await this.fingerprintLogEntity.save(data);
                return true;
            }
        }
        else {
            const { model3Count, model4Count, drawMjCount } = log;
            let data = {
                model3Count,
                model4Count,
                drawMjCount,
            };
            const date = Number(new Date(log.updatedAt));
            const isUpdateLastDay = this.isUpdatedToday(date);
            if (isUpdateLastDay) {
                data[baseKey] = data[baseKey] + amount;
            }
            else {
                data = {
                    model3Count: 0,
                    model4Count: 0,
                    drawMjCount: 0,
                };
                data[baseKey] = data[baseKey] + amount;
            }
            if (data[baseKey] > settings[baseKey]) {
                throw new common_1.HttpException(`今日体验额度使用完毕，请注册使用完整服务！`, common_1.HttpStatus.PAYMENT_REQUIRED);
            }
            else {
                await this.fingerprintLogEntity.update({ fingerprint: id }, data);
                return true;
            }
        }
    }
    isUpdatedToday(date) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return date >= todayStart;
    }
    async deductFromBalance(userId, deductionType, amount, UseAmount = 0) {
        const b = await this.userBalanceEntity.findOne({ where: { userId } });
        if (!b) {
            throw new common_1.HttpException('缺失当前用户账户记录！', common_1.HttpStatus.BAD_REQUEST);
        }
        const keys = {
            1: {
                member: 'memberModel3Count',
                nonMember: 'model3Count',
                token: 'useModel3Token',
            },
            2: {
                member: 'memberModel4Count',
                nonMember: 'model4Count',
                token: 'useModel4Token',
            },
            3: {
                member: 'memberDrawMjCount',
                nonMember: 'drawMjCount',
                token: 'useDrawMjToken',
            },
        };
        const { member, nonMember, token } = keys[deductionType];
        let remainingAmount = amount;
        const newMemberBalance = Math.max(b[member] - remainingAmount, 0);
        remainingAmount -= b[member] - newMemberBalance;
        let newNonMemberBalance = b[nonMember];
        if (remainingAmount > 0) {
            newNonMemberBalance = Math.max(b[nonMember] - remainingAmount, 0);
            remainingAmount -= b[nonMember] - newNonMemberBalance;
        }
        const updateBalance = {
            [member]: newMemberBalance,
            [nonMember]: newNonMemberBalance,
            [token]: (b[token] || 0) + UseAmount,
        };
        if (token === 'useModel3Token' || token === 'useModel4Token') {
            updateBalance[token.replace('Token', 'Count')] =
                (b[token.replace('Token', 'Count')] || 0) + amount;
        }
        const result = await this.userBalanceEntity.update({ userId }, updateBalance);
        if (result.affected === 0) {
            throw new common_1.HttpException('消费余额失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async queryUserBalance(userId) {
        try {
            const res = await this.userBalanceEntity.findOne({
                where: { userId },
                select: [
                    'packageId',
                    'model3Count',
                    'model4Count',
                    'drawMjCount',
                    'memberModel3Count',
                    'memberModel4Count',
                    'memberDrawMjCount',
                    'useModel3Count',
                    'useModel4Count',
                    'useModel3Token',
                    'useModel4Token',
                    'useDrawMjToken',
                    'expirationTime',
                ],
            });
            if (!res) {
                const user = await this.createBaseUserBalance(userId);
                if (user) {
                    return await this.queryUserBalance(userId);
                }
                else {
                    throw new common_1.HttpException('查询当前用户余额失败！', common_1.HttpStatus.BAD_REQUEST);
                }
            }
            res.sumModel3Count = res.packageId
                ? res.model3Count + res.memberModel3Count
                : res.model3Count;
            res.sumModel4Count = res.packageId
                ? res.model4Count + res.memberModel4Count
                : res.model4Count;
            res.sumDrawMjCount = res.packageId
                ? res.drawMjCount + res.memberDrawMjCount
                : res.drawMjCount;
            res.expirationTime = res.expirationTime ? (0, date_1.formatDate)(res.expirationTime, 'YYYY-MM-DD') : null;
            return res;
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async saveRecordRechargeLog(logInfo) {
        const { userId, rechargeType, model3Count, model4Count, drawMjCount, days = -1, pkgName = '', extent = '', } = logInfo;
        if (!userId) {
            throw new common_1.HttpException('当前用户不存在,记录充值日志异常', common_1.HttpStatus.BAD_REQUEST);
        }
        const uid = (0, utils_1.createRandomUid)();
        return await this.accountLogEntity.save({
            userId,
            rechargeType,
            model3Count,
            model4Count,
            drawMjCount,
            days,
            extent,
            uid,
            pkgName,
        });
    }
    async createBaseUserBalance(userId, userBalanceInfo = {}) {
        const { model3Count = 0, model4Count = 0, drawMjCount = 0 } = userBalanceInfo;
        const balance = await this.userBalanceEntity.findOne({ where: { userId } });
        if (balance) {
            throw new common_1.HttpException('当前用户无需创建账户信息！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.userBalanceEntity.save({
            userId,
            model3Count,
            model4Count,
            drawMjCount,
        });
    }
    async addBalanceToUser(userId, balance, days = -1) {
        try {
            const userBalanceInfo = (await this.userBalanceEntity.findOne({ where: { userId } })) ||
                (await this.createBaseUserBalance(userId));
            if (!userBalanceInfo) {
                throw new common_1.HttpException('查询用户账户信息失败！', common_1.HttpStatus.BAD_REQUEST);
            }
            const { model3Count, model4Count, drawMjCount, memberModel3Count, memberModel4Count, memberDrawMjCount, appCats, } = userBalanceInfo;
            let params = {};
            if (days > 0) {
                const { packageId } = balance;
                if (!packageId) {
                    throw new common_1.HttpException('缺失当前套餐ID、充值失败！', common_1.HttpStatus.BAD_REQUEST);
                }
                const pkgInfo = await this.cramiPackageEntity.findOne({
                    where: { id: packageId },
                });
                if (!pkgInfo) {
                    throw new common_1.HttpException('当前套餐不存在！', common_1.HttpStatus.BAD_REQUEST);
                }
                const { weight } = pkgInfo;
                let newApps = '';
                if (balance.appCats) {
                    if (!appCats) {
                        newApps = balance.appCats;
                    }
                    else {
                        newApps = appCats + ',' + balance.appCats;
                    }
                }
                else {
                    newApps = appCats || '';
                }
                if (!userBalanceInfo.packageId) {
                    params = {
                        memberModel3Count: memberModel3Count + balance.model3Count,
                        memberModel4Count: memberModel4Count + balance.model4Count,
                        memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
                        expirationTime: (0, date_1.default)()
                            .add(days > 0 ? days : 0, 'day')
                            .format('YYYY-MM-DD HH:mm:ss'),
                        packageId: packageId,
                        appCats: newApps,
                    };
                }
                else {
                    const curPackageInfo = await this.cramiPackageEntity.findOne({
                        where: { id: userBalanceInfo.packageId },
                    });
                    if (weight >= curPackageInfo.weight) {
                        params = {
                            memberModel3Count: memberModel3Count + balance.model3Count,
                            memberModel4Count: memberModel4Count + balance.model4Count,
                            memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
                            expirationTime: (0, date_1.default)(userBalanceInfo.expirationTime)
                                .add(days > 0 ? days : 0, 'day')
                                .format('YYYY-MM-DD HH:mm:ss'),
                            packageId: packageId,
                            appCats: newApps,
                        };
                    }
                    if (weight < curPackageInfo.weight) {
                        params = {
                            memberModel3Count: memberModel3Count + balance.model3Count,
                            memberModel4Count: memberModel4Count + balance.model4Count,
                            memberDrawMjCount: memberDrawMjCount + balance.drawMjCount,
                            appCats: newApps,
                        };
                    }
                }
            }
            if (days <= 0) {
                let newApps = '';
                if (balance.appCats) {
                    if (!appCats) {
                        newApps = balance.appCats;
                    }
                    else {
                        newApps = appCats + ',' + balance.appCats;
                    }
                    params = {
                        model3Count: model3Count + balance.model3Count,
                        model4Count: model4Count + balance.model4Count,
                        drawMjCount: drawMjCount + balance.drawMjCount,
                        appCats: newApps,
                    };
                }
                else {
                    params = {
                        model3Count: model3Count + balance.model3Count,
                        model4Count: model4Count + balance.model4Count,
                        drawMjCount: drawMjCount + balance.drawMjCount,
                    };
                }
            }
            const result = await this.userBalanceEntity.update({ userId }, params);
            if (result.affected === 0) {
                throw new common_1.HttpException(`${userId}充值失败`, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('用户充值失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async addBalanceToOrder(order) {
        console.log('充值的工单信息:', order);
        try {
            const { userId, goodsId } = order;
            const pkg = await this.cramiPackageEntity.findOne({
                where: { id: order.goodsId, status: 1 },
            });
            if (!pkg) {
                throw new common_1.HttpException('非法操作、当前充值套餐暂不存在！', common_1.HttpStatus.BAD_REQUEST);
            }
            const { model3Count, model4Count, drawMjCount, days, name: pkgName, appCats } = pkg;
            const money = {
                model3Count,
                model4Count,
                drawMjCount,
                days,
                packageId: order.goodsId,
                appCats,
            };
            await this.addBalanceToUser(userId, money, days);
            await this.saveRecordRechargeLog({
                userId,
                rechargeType: balance_constant_1.RechargeType.SCAN_PAY,
                model3Count,
                model4Count,
                drawMjCount,
                pkgName,
                days,
            });
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('充值失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getRechargeLog(req, params) {
        const { page = 1, size = 20 } = params;
        const { id } = req.user;
        const [rows, count] = await this.accountLogEntity.findAndCount({
            where: { userId: id },
            order: { id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        rows.forEach((item) => {
            item.expireDateCn = item.days > 0 ? `${item.days}天` : '永久';
        });
        return { rows: (0, date_1.formatCreateOrUpdateDate)(rows), count };
    }
    async getAccountLog(req, params) {
        try {
            const { page = 1, size = 10, userId, rechargeType, packageId } = params;
            const { role } = req.user;
            const where = {};
            rechargeType && (where.rechargeType = rechargeType);
            where.userId = userId || (0, typeorm_2.LessThan)(100000);
            packageId && (where.packageId = { $like: `%${packageId}%` });
            const [rows, count] = await this.accountLogEntity.findAndCount({
                where,
                order: { id: 'DESC' },
                skip: (page - 1) * size,
                take: size,
            });
            const userIds = rows.map((item) => item.userId);
            const userInfo = await this.userEntity.find({
                where: { id: (0, typeorm_2.In)(userIds) },
            });
            rows.forEach((item) => {
                const user = userInfo.find((user) => user.id === item.userId);
                item.username = user?.username;
                item.email = user?.email;
                item.phone = user?.phone;
                item.status = user?.status;
                item.avatar = user?.avatar;
            });
            if (role !== 'super') {
                rows.forEach((item) => {
                    item.email = item.email ? (0, utils_1.hideString)(item.email) : '';
                    item.phone = item.phone ? (0, utils_1.hideString)(item.phone) : '';
                });
            }
            return { rows, count };
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('查询用户账户失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async queryUserBalanceByIds(ids) {
        return await this.userBalanceEntity.find({ where: { userId: (0, typeorm_2.In)(ids) } });
    }
    async refundMjBalance(userId, amount) {
        return await this.deductFromBalance(userId, 'mjDraw', -amount);
    }
    async inheritVisitorData(req) {
        const { fingerprint } = req.headers;
        const { id: userId } = req.user;
        await this.chatLogEntity.update({ userId: Number(fingerprint) }, { userId });
        await this.chatGroupEntity.update({ userId: Number(fingerprint) }, { userId });
        return 1;
    }
    async getVisitorCount(req) {
        const { fingerprint } = req.headers;
        const countChat = await this.chatLogEntity.count({
            where: { userId: fingerprint },
        });
        const countChatGroup = await this.chatGroupEntity.count({
            where: { userId: fingerprint },
        });
        return countChat || countChatGroup || 0;
    }
    async getUserApps(userId) {
        try {
            const userBalance = await this.userBalanceEntity.findOne({
                where: { userId },
                select: ['packageId', 'expirationTime', 'appCats'],
            });
            if (!userBalance || !userBalance.packageId) {
                return [];
            }
            const now = new Date();
            const expirationTime = new Date(userBalance.expirationTime);
            if (expirationTime && expirationTime > now) {
                return userBalance.appCats?.split(',') || [];
            }
            return [];
        }
        catch (error) {
            console.log('检查用户会员状态出错: ', error);
            return [];
        }
    }
    async checkUserCertification(userId) {
        const userInfo = await this.userEntity.findOne({
            where: { id: userId },
        });
        const userBalance = await this.userBalanceEntity.findOne({
            where: { userId },
        });
        if (!userInfo || !userBalance) {
            return;
        }
        const { phoneValidationMessageCount, identityVerificationMessageCount, openIdentity, openPhoneValidation, } = await this.globalConfigService.getConfigs([
            'phoneValidationMessageCount',
            'identityVerificationMessageCount',
            'openIdentity',
            'openPhoneValidation',
        ]);
        const phoneValidationCount = Number(phoneValidationMessageCount);
        const identityValidationCount = Number(identityVerificationMessageCount);
        const model3Count = Number(userBalance.useModel3Count) || 0;
        const model4Count = Number(userBalance.useModel4Count) || 0;
        const totalTokens = model3Count + model4Count;
        if (openPhoneValidation === '1' && totalTokens >= phoneValidationCount && !userInfo.phone) {
            throw new common_1.HttpException('请完成手机号绑定', common_1.HttpStatus.BAD_REQUEST);
        }
        if (openIdentity === '1' &&
            totalTokens >= identityValidationCount &&
            (!userInfo.realName || !userInfo.idCard)) {
            throw new common_1.HttpException('请完成实名认证', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.UserBalanceService = UserBalanceService;
exports.UserBalanceService = UserBalanceService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(balance_entity_1.BalanceEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(userBalance_entity_1.UserBalanceEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(accountLog_entity_1.AccountLogEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(cramiPackage_entity_1.CramiPackageEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __param(5, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(6, (0, typeorm_1.InjectRepository)(fingerprint_entity_1.FingerprintLogEntity)),
    __param(7, (0, typeorm_1.InjectRepository)(chatGroup_entity_1.ChatGroupEntity)),
    __param(8, (0, typeorm_1.InjectRepository)(chatLog_entity_1.ChatLogEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _c : Object, typeof (_d = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _d : Object, typeof (_e = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _e : Object, typeof (_f = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _f : Object, typeof (_g = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _g : Object, typeof (_h = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _h : Object, typeof (_j = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _j : Object, typeof (_k = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _k : Object])
], UserBalanceService);


/***/ }),
/* 35 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RechargeType = exports.ChatType = void 0;
exports.ChatType = {
    NORMAL_CHAT: 1,
    PAINT: 2,
    EXTENDED_CHAT: 3,
};
exports.RechargeType = {
    REG_GIFT: 1,
    INVITE_GIFT: 2,
    REFER_GIFT: 3,
    PACKAGE_GIFT: 4,
    ADMIN_GIFT: 5,
    SCAN_PAY: 6,
    DRAW_FAIL_REFUND: 7,
    SIGN_IN: 8,
};


/***/ }),
/* 36 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(37), exports);
__exportStar(__webpack_require__(38), exports);
__exportStar(__webpack_require__(40), exports);
__exportStar(__webpack_require__(42), exports);
__exportStar(__webpack_require__(43), exports);
__exportStar(__webpack_require__(44), exports);
__exportStar(__webpack_require__(45), exports);
__exportStar(__webpack_require__(47), exports);
__exportStar(__webpack_require__(52), exports);
__exportStar(__webpack_require__(53), exports);
__exportStar(__webpack_require__(54), exports);
__exportStar(__webpack_require__(55), exports);
__exportStar(__webpack_require__(56), exports);
__exportStar(__webpack_require__(57), exports);
__exportStar(__webpack_require__(58), exports);
__exportStar(__webpack_require__(59), exports);
__exportStar(__webpack_require__(61), exports);
__exportStar(__webpack_require__(62), exports);
__exportStar(__webpack_require__(63), exports);
__exportStar(__webpack_require__(64), exports);
__exportStar(__webpack_require__(65), exports);
__exportStar(__webpack_require__(66), exports);
__exportStar(__webpack_require__(67), exports);
__exportStar(__webpack_require__(68), exports);
__exportStar(__webpack_require__(69), exports);
__exportStar(__webpack_require__(70), exports);


/***/ }),
/* 37 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto = __webpack_require__(16);
const encryptionKey = 'bf3c116f2470cb4che9071240917c171';
const initializationVector = '518363fh72eec1v4';
const algorithm = 'aes-256-cbc';
function encrypt(text) {
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, initializationVector);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}
function decrypt(text) {
    try {
        const decipher = crypto.createDecipheriv(algorithm, encryptionKey, initializationVector);
        let decrypted = decipher.update(text, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        process.exit(1);
    }
}


/***/ }),
/* 38 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.convertUrlToBase64 = convertUrlToBase64;
const common_1 = __webpack_require__(2);
const axios_1 = __webpack_require__(39);
async function convertUrlToBase64(url) {
    try {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const base64Data = `data:${response.headers['content-type']};base64,${buffer.toString('base64')}`;
        return base64Data;
    }
    catch (error) {
        common_1.Logger.error('下载图片失败', error);
        return url;
    }
}


/***/ }),
/* 39 */
/***/ ((module) => {

module.exports = require("axios");

/***/ }),
/* 40 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createOrderId = createOrderId;
const uuid_1 = __webpack_require__(41);
function createOrderId() {
    return (0, uuid_1.v1)().toString().replace(/-/g, '');
}


/***/ }),
/* 41 */
/***/ ((module) => {

module.exports = require("uuid");

/***/ }),
/* 42 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createRandomCode = createRandomCode;
function createRandomCode() {
    const min = 100000;
    const max = 999999;
    return Math.floor(Math.random() * (max - min + 1) + min);
}


/***/ }),
/* 43 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.generateRandomString = generateRandomString;
function generateRandomString() {
    const length = 10;
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }
    return result;
}


/***/ }),
/* 44 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createRandomNonceStr = createRandomNonceStr;
function createRandomNonceStr(len) {
    const data = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let str = '';
    for (let i = 0; i < len; i++) {
        str += data.charAt(parseInt((Math.random() * data.length).toFixed(0), 10));
    }
    return str;
}


/***/ }),
/* 45 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createRandomUid = createRandomUid;
const guid_typescript_1 = __webpack_require__(46);
function createRandomUid() {
    const uuid = guid_typescript_1.Guid.create();
    return uuid.toString().substr(0, 10).replace('-', '');
}


/***/ }),
/* 46 */
/***/ ((module) => {

module.exports = require("guid-typescript");

/***/ }),
/* 47 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatDate = formatDate;
exports.formatCreateOrUpdateDate = formatCreateOrUpdateDate;
exports.isExpired = isExpired;
const dayjs = __webpack_require__(48);
__webpack_require__(49);
const b = __webpack_require__(50);
const a = __webpack_require__(51);
dayjs.locale('zh-cn');
dayjs.extend(a);
dayjs.extend(b);
dayjs.tz.setDefault('Asia/Shanghai');
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs(date).format(format);
}
function formatCreateOrUpdateDate(input, format = 'YYYY-MM-DD HH:mm:ss') {
    if (Array.isArray(input)) {
        return input.map((t) => {
            t.createdAt = t?.createdAt ? dayjs(t.createdAt).format(format) : dayjs().format(format);
            t.updatedAt = t?.updatedAt ? dayjs(t.updatedAt).format(format) : dayjs().format(format);
            return t;
        });
    }
    else {
        let obj = {};
        try {
            obj = JSON.parse(JSON.stringify(input));
        }
        catch (error) { }
        obj?.createdAt && (obj.createdAt = dayjs(obj.createdAt).format(format));
        obj?.updatedAt && (obj.updatedAt = dayjs(obj.updatedAt).format(format));
        return obj;
    }
}
function isExpired(createdAt, days) {
    const expireDate = new Date(createdAt.getTime() + days * 24 * 60 * 60 * 1000);
    const now = new Date();
    return now > expireDate;
}
exports["default"] = dayjs;


/***/ }),
/* 48 */
/***/ ((module) => {

module.exports = require("dayjs");

/***/ }),
/* 49 */
/***/ ((module) => {

module.exports = require("dayjs/locale/zh-cn");

/***/ }),
/* 50 */
/***/ ((module) => {

module.exports = require("dayjs/plugin/timezone");

/***/ }),
/* 51 */
/***/ ((module) => {

module.exports = require("dayjs/plugin/utc");

/***/ }),
/* 52 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.copyRightMsg = void 0;
exports.atob = atob;
function atob(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
}
exports.copyRightMsg = [
    'agxoTstMY8m+DJO89Iwy4zqcFTqlcj/Fa/erMTvn0IexetXaDttr4K/BN2+RbtfouXOeFjPDYnxOfQ+IIpuJ3PmtyHAzmlGFls/HvBDeh6EXAQ3waALbvK9Ue96soAb5/3Tv6VuZE7npISqXiYhI6Vqx4yDVYf6vUUkEO9jvVotWQkLOLkr6M/guLK6sik/ZOgHvSlDYKAv79NFJJ0Tt0WkH2SyN8l+woMiWVTOKkdE=',
    'nXdXi8UU7J5av2eDOFjxQWlZDa+3bdASE4UwpqT6B11XSCweKKuzHxmFO2wx45iVlib/V0tt+NbEcOQZtzEWKqHsREkwEb5aqVCUl2Kj4nJeEFId2iyvY6MWEV1lHtCY+htpJoyqwQJc7yeNfpTl2SLBubWk77p4AHei1QFEs1rpOOwyE79lF0RqzY/Cpzhs',
    'VjVCGib1VFp7hNynpKGQPUrX+ishpxi2u5a4txHXzk2nyUP1NZfIomEDmGhDTQ7VRJLox+8urtVG1CBBSct1v+4OA2ucAcDUFoy1H1Kl1z+dndVcNU6gz5YGnDppsxY8uGFAVGsWrDl2DIOKxk7kMURaRiQCXCHRF/3sLGyIEmE6KL9Q4kDInB6vuzBScxupFShMXTq2XrOhwRgn2elcig==',
    'ZPcz1IaPDMGI3Yn9sm4QOT0qCZo7yZbJl4/c2RTrhUKINkjGB5yb0yN5vAnLtt/o8cmpoOoH3PUSOOWQa9aKD86NWK+1r8wBOVjwXZOpp2gbB1ZJLbWvjRbENvEJxVsLROXnpNDqUXVGxFMaIt+gmEi3Rp0thqC1soXUpvM1zqU4+LkQmunR7UytvzwXEmXBlIfPwz5hv+n/lxDsw526KWixC3jLLpeijw5433Zh7cI=',
    'YPo1HNzS6p6190ku4f1PQENUBa/ip+v+6sPuQXVyAn3axo6SLKQBszNr3PAW2EzWhZLy2o+nBgr3o3IOy9OgNit1JHrCklpVp172wbGDKh8sB8HCXyJoRv3BaZVY5UhyhpV5K+4nPoM2RUwvIGONUGFPQfPQv9N8MS8UCL7UnWYcVLzxWo0ZDg+UXFRr7NhXKu7KQ7e1+Wiqm0qE+olfDVowi4pGDRGrYL154wEEJUo=',
];


/***/ }),
/* 53 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatUrl = formatUrl;
function formatUrl(url) {
    let formattedUrl = url.replace(/\s+/g, '');
    if (formattedUrl.endsWith('/')) {
        formattedUrl = formattedUrl.slice(0, -1);
    }
    return formattedUrl;
}


/***/ }),
/* 54 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.generateCramiCode = generateCramiCode;
const uuid_1 = __webpack_require__(41);
function generateCramiCode() {
    const code = (0, uuid_1.v4)().replace(/-/g, '').slice(0, 16);
    return code;
}


/***/ }),
/* 55 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getClientIp = getClientIp;
function getFirstValidIp(ipString) {
    const ips = ipString.split(',').map(ip => ip.trim());
    return ips.find(ip => isValidIp(ip)) || '';
}
function isValidIp(ip) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || /^::ffff:\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}
function getClientIp(req) {
    const forwardedFor = req.header('x-forwarded-for');
    let clientIp = forwardedFor ? getFirstValidIp(forwardedFor) : '';
    if (!clientIp) {
        clientIp = req.connection.remoteAddress || req.socket.remoteAddress || '';
    }
    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7);
    }
    return clientIp;
}


/***/ }),
/* 56 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getDiffArray = getDiffArray;
function getDiffArray(aLength, bLength, str) {
    const a = Array.from({ length: aLength }, (_, i) => i + 1);
    const b = Array.from({ length: bLength }, (_, i) => i + 1);
    const diffArray = [];
    for (let i = 0; i < a.length; i++) {
        if (!b.includes(a[i])) {
            diffArray.push(`${str}${a[i]}`);
        }
    }
    return diffArray;
}


/***/ }),
/* 57 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRandomItem = getRandomItem;
function getRandomItem(array) {
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}


/***/ }),
/* 58 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRandomItemFromArray = getRandomItemFromArray;
function getRandomItemFromArray(array) {
    if (array.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}


/***/ }),
/* 59 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTokenCount = void 0;
const gpt_tokenizer_1 = __webpack_require__(60);
const getTokenCount = async (input) => {
    let text = '';
    if (Array.isArray(input)) {
        text = input.reduce((pre, cur) => {
            if (Array.isArray(cur.content)) {
                const contentText = cur.content
                    .filter((item) => item.type === 'text')
                    .map((item) => item.text)
                    .join(' ');
                return pre + contentText;
            }
            else {
                return pre + (cur.content || '');
            }
        }, '');
    }
    else if (typeof input === 'string') {
        text = input;
    }
    else if (input) {
        text = String(input);
    }
    text = text.replace(/<\|endoftext\|>/g, '');
    return (0, gpt_tokenizer_1.encode)(text).length;
};
exports.getTokenCount = getTokenCount;


/***/ }),
/* 60 */
/***/ ((module) => {

module.exports = require("gpt-tokenizer");

/***/ }),
/* 61 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.handleError = handleError;
const axios_1 = __webpack_require__(39);
function handleError(error) {
    let message = '发生未知错误，请稍后再试';
    if (axios_1.default.isAxiosError(error) && error.response) {
        switch (error.response.status) {
            case 400:
                message = '发生错误：400 Bad Request - 请求因格式错误无法被服务器处理。';
                break;
            case 401:
                message = '发生错误：401 Unauthorized - 请求要求进行身份验证。';
                break;
            case 403:
                message = '发生错误：403 Forbidden - 服务器拒绝执行请求。';
                break;
            case 404:
                message = '发生错误：404 Not Found - 请求的资源无法在服务器上找到。';
                break;
            case 500:
                message = '发生错误：500 Internal Server Error - 服务器内部错误，无法完成请求。';
                break;
            case 502:
                message =
                    '发生错误：502 Bad Gateway - 作为网关或代理工作的服务器从上游服务器收到无效响应。';
                break;
            case 503:
                message =
                    '发生错误：503 Service Unavailable - 服务器暂时处于超负载或维护状态，无法处理请求。';
                break;
            default:
                break;
        }
    }
    else {
        message = error.message || message;
    }
    return message;
}


/***/ }),
/* 62 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hideString = hideString;
function hideString(input, str) {
    const length = input.length;
    const start = input.slice(0, (length - 10) / 2);
    const end = input.slice((length + 10) / 2, length);
    const hidden = '*'.repeat(10);
    if (str) {
        return `**********${str}**********`;
    }
    return `${start}${hidden}${end}`;
}


/***/ }),
/* 63 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.maskCrami = maskCrami;
function maskCrami(str) {
    if (str.length !== 16) {
        throw new Error('Invalid input');
    }
    const masked = str.substring(0, 6) + '****' + str.substring(10);
    return masked;
}


/***/ }),
/* 64 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.maskEmail = maskEmail;
function maskEmail(email) {
    if (!email)
        return '';
    const atIndex = email.indexOf('@');
    if (atIndex <= 1) {
        return email;
    }
    const firstPart = email.substring(0, atIndex - 1);
    const lastPart = email.substring(atIndex);
    const maskedPart = '*'.repeat(firstPart.length - 1);
    return `${firstPart.charAt(0)}${maskedPart}${email.charAt(atIndex - 1)}${lastPart}`;
}


/***/ }),
/* 65 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.maskIpAddress = maskIpAddress;
function maskIpAddress(ipAddress) {
    if (!ipAddress)
        return '';
    const ipArray = ipAddress.split('.');
    ipArray[2] = '***';
    return ipArray.join('.');
}


/***/ }),
/* 66 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.removeSpecialCharacters = removeSpecialCharacters;
function removeSpecialCharacters(inputString) {
    return inputString.replace(/[^\w\s-]/g, '');
}


/***/ }),
/* 67 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.removeThinkTags = removeThinkTags;
function removeThinkTags(content) {
    if (content === null || content === undefined) {
        return content;
    }
    if (Array.isArray(content)) {
        return content.map(item => {
            if (item && item.type === 'text' && typeof item.text === 'string') {
                item.text = item.text.replace(/<think>[\s\S]*?<\/think>/g, '');
            }
            return item;
        });
    }
    if (typeof content === 'string') {
        return content.replace(/<think>[\s\S]*?<\/think>/g, '');
    }
    return content;
}


/***/ }),
/* 68 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.importDynamic = void 0;
exports.isNotEmptyString = isNotEmptyString;
function isNotEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}
exports.importDynamic = new Function('modulePath', 'return import(modulePath)');


/***/ }),
/* 69 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.utcToShanghaiTime = utcToShanghaiTime;
function utcToShanghaiTime(utcTime, format = 'YYYY/MM/DD hh:mm:ss') {
    const date = new Date(utcTime);
    const shanghaiTime = date.getTime() + 8 * 60 * 60 * 1000;
    const shanghaiDate = new Date(shanghaiTime);
    let result = format.replace('YYYY', shanghaiDate.getFullYear().toString());
    result = result.replace('MM', `0${shanghaiDate.getMonth() + 1}`.slice(-2));
    result = result.replace('DD', `0${shanghaiDate.getDate()}`.slice(-2));
    result = result.replace('hh', `0${shanghaiDate.getHours()}`.slice(-2));
    result = result.replace('mm', `0${shanghaiDate.getMinutes()}`.slice(-2));
    result = result.replace('ss', `0${shanghaiDate.getSeconds()}`.slice(-2));
    return result;
}


/***/ }),
/* 70 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.correctApiBaseUrl = correctApiBaseUrl;
async function correctApiBaseUrl(baseUrl) {
    if (!baseUrl)
        return '';
    let url = baseUrl.trim();
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    if (!/\/v\d+(?:beta|alpha)?/.test(url)) {
        return `${url}/v1`;
    }
    return url;
}


/***/ }),
/* 71 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CramiPackageEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let CramiPackageEntity = class CramiPackageEntity extends baseEntity_1.BaseEntity {
    name;
    des;
    coverImg;
    price;
    order;
    status;
    weight;
    days;
    model3Count;
    model4Count;
    drawMjCount;
    appCats;
};
exports.CramiPackageEntity = CramiPackageEntity;
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: '套餐名称' }),
    __metadata("design:type", String)
], CramiPackageEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐介绍详细信息' }),
    __metadata("design:type", String)
], CramiPackageEntity.prototype, "des", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐封面图片', nullable: true }),
    __metadata("design:type", String)
], CramiPackageEntity.prototype, "coverImg", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐价格￥', type: 'decimal', scale: 2, precision: 10 }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐排序、数字越大越靠前', default: 100 }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐是否启用中 0：禁用 1：启用', default: 1 }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐权重、数字越大表示套餐等级越高越贵', unique: true }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "weight", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '卡密有效期天数、从使用的时候开始计算，设为-1则不限时间',
        default: 0,
    }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "days", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐包含的模型3数量', default: 0, nullable: true }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "model3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐包含的模型4数量', default: 0, nullable: true }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "model4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐包含的MJ绘画数量', default: 0, nullable: true }),
    __metadata("design:type", Number)
], CramiPackageEntity.prototype, "drawMjCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐包含的应用分类列表', default: '', nullable: true }),
    __metadata("design:type", String)
], CramiPackageEntity.prototype, "appCats", void 0);
exports.CramiPackageEntity = CramiPackageEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'crami_package' })
], CramiPackageEntity);


/***/ }),
/* 72 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BaseEntity = void 0;
const typeorm_1 = __webpack_require__(3);
let BaseEntity = class BaseEntity {
    id;
    createdAt;
    updatedAt;
    deletedAt;
};
exports.BaseEntity = BaseEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], BaseEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({
        type: 'datetime',
        length: 0,
        nullable: false,
        name: 'createdAt',
        comment: '创建时间',
    }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], BaseEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({
        type: 'datetime',
        length: 0,
        nullable: false,
        name: 'updatedAt',
        comment: '更新时间',
    }),
    __metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], BaseEntity.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.DeleteDateColumn)({
        type: 'datetime',
        length: 0,
        nullable: false,
        name: 'deletedAt',
        comment: '删除时间',
    }),
    __metadata("design:type", typeof (_c = typeof Date !== "undefined" && Date) === "function" ? _c : Object)
], BaseEntity.prototype, "deletedAt", void 0);
exports.BaseEntity = BaseEntity = __decorate([
    (0, typeorm_1.Entity)()
], BaseEntity);


/***/ }),
/* 73 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let ConfigEntity = class ConfigEntity extends baseEntity_1.BaseEntity {
    configKey;
    configVal;
    public;
    encrypt;
    status;
};
exports.ConfigEntity = ConfigEntity;
__decorate([
    (0, typeorm_1.Column)({ length: 255, comment: '配置名称', nullable: true }),
    __metadata("design:type", String)
], ConfigEntity.prototype, "configKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', comment: '配置内容', nullable: true }),
    __metadata("design:type", String)
], ConfigEntity.prototype, "configVal", void 0);
__decorate([
    (0, typeorm_1.Column)({
        default: 0,
        comment: '配置是否公开，公开内容对前端项目展示  0：不公开 1：公开',
    }),
    __metadata("design:type", Number)
], ConfigEntity.prototype, "public", void 0);
__decorate([
    (0, typeorm_1.Column)({
        default: 0,
        comment: '配置是否加密，加密内容仅仅super权限可看 0：不加 1：加',
    }),
    __metadata("design:type", Number)
], ConfigEntity.prototype, "encrypt", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '配置状态 0:关闭 1：启用' }),
    __metadata("design:type", Number)
], ConfigEntity.prototype, "status", void 0);
exports.ConfigEntity = ConfigEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'config' })
], ConfigEntity);


/***/ }),
/* 74 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GlobalConfigService = void 0;
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const axios_1 = __webpack_require__(39);
const fs = __webpack_require__(18);
const typeorm_2 = __webpack_require__(3);
const chatLog_entity_1 = __webpack_require__(75);
const models_service_1 = __webpack_require__(76);
const config_entity_1 = __webpack_require__(73);
const packageJsonContent = fs.readFileSync('package.json', 'utf-8');
const packageJson = JSON.parse(packageJsonContent);
const version = packageJson.version;
console.log(' current use version in ------>: ', version);
let GlobalConfigService = class GlobalConfigService {
    configEntity;
    chatLogEntity;
    modelsService;
    constructor(configEntity, chatLogEntity, modelsService) {
        this.configEntity = configEntity;
        this.chatLogEntity = chatLogEntity;
        this.modelsService = modelsService;
    }
    globalConfigs = {};
    wechatAccessToken;
    wechatJsapiTicket;
    oldWechatAccessToken;
    oldWechatJsapiTicket;
    async onModuleInit() {
        await this.initGetAllConfig();
    }
    async getConfigs(configKey) {
        if (configKey.length === 0)
            return;
        if (configKey.includes('wechatAccessToken') && configKey.length === 1) {
            return this.wechatAccessToken;
        }
        if (configKey.includes('wechatJsapiTicket') && configKey.length === 1) {
            return this.wechatJsapiTicket;
        }
        if (configKey.includes('oldWechatAccessToken') && configKey.length === 1) {
            return this.oldWechatAccessToken;
        }
        if (configKey.includes('oldWechatJsapiTicket') && configKey.length === 1) {
            return this.oldWechatJsapiTicket;
        }
        if (configKey.length === 1) {
            return this.globalConfigs[configKey[0]];
        }
        else {
            const result = {};
            configKey.forEach(key => (result[key] = this.globalConfigs[key]));
            return result;
        }
    }
    async initGetAllConfig() {
        const data = await this.configEntity.find();
        this.globalConfigs = data.reduce((prev, cur) => {
            prev[cur.configKey] = cur.configVal;
            return prev;
        }, {});
        this.initBaiduSensitive();
    }
    async initBaiduSensitive(isInit = true) {
        const { baiduTextApiKey, baiduTextSecretKey } = await this.getConfigs([
            'baiduTextApiKey',
            'baiduTextSecretKey',
        ]);
        if (!baiduTextApiKey || !baiduTextSecretKey) {
            return;
        }
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        const url = `https://aip.baidubce.com/oauth/2.0/token?client_id=${baiduTextApiKey}&client_secret=${baiduTextSecretKey}&grant_type=client_credentials`;
        try {
            const response = await axios_1.default.post(url, { headers });
            this.globalConfigs.baiduTextAccessToken = response.data.access_token;
        }
        catch (error) {
            if (isInit) {
            }
            else {
                throw new common_1.HttpException(error.response.data.error_description, common_1.HttpStatus.BAD_REQUEST);
            }
        }
    }
    async getWechatAccessToken(isInit = false) {
        const { wechatOfficialAppId: appId, wechatOfficialAppSecret: secret } = await this.getConfigs([
            'wechatOfficialAppId',
            'wechatOfficialAppSecret',
        ]);
        if (!appId || !secret) {
            return common_1.Logger.error('还未配置微信的appId和secret、配置后才可进行微信扫码登录！！！', 'OfficialService');
        }
        this.wechatAccessToken = await this.fetchBaseAccessToken(appId, secret, isInit);
        common_1.Logger.log(`wechat refresh access_token  ==> ${this.wechatAccessToken}`, 'OfficialService');
    }
    async getOldWechatAccessToken(isInit = false) {
        try {
            const { oldWechatOfficialAppId: appId, oldWechatOfficialAppSecret: secret } = await this.getConfigs(['oldWechatOfficialAppId', 'oldWechatOfficialAppSecret']);
            if (!appId || !secret) {
                return null;
            }
            if (process.env.ISDEV === 'true') {
                common_1.Logger.log('开发环境下，返回空token', 'GlobalConfigService');
                return null;
            }
            this.oldWechatAccessToken = await this.fetchBaseAccessToken(appId, secret, isInit);
        }
        catch (error) {
            return null;
        }
    }
    async fetchBaseAccessToken(appId, secret, isInit = false) {
        common_1.Logger.log(`开始获取access_token, appId: ${appId.substring(0, 5)}..., isInit: ${isInit}`, 'GlobalConfigService');
        if (process.env.ISDEV === 'true') {
            return '';
        }
        try {
            const Url = (0, utils_1.formatUrl)(process.env.weChatApiUrlToken || 'https://api.weixin.qq.com/cgi-bin/token');
            const requestUrl = `${Url}?grant_type=client_credential&appid=${appId}&secret=${secret}`;
            common_1.Logger.log(`请求access_token URL: ${requestUrl}`, 'GlobalConfigService');
            const response = await axios_1.default.get(requestUrl);
            common_1.Logger.log(`获取access_token响应: ${JSON.stringify(response.data)}`, 'GlobalConfigService');
            const { errmsg, access_token, errcode } = response.data;
            if (errmsg || errcode) {
                common_1.Logger.error(`获取access_token失败 - 错误码: ${errcode}, 错误信息: ${errmsg}`, 'GlobalConfigService');
                return '';
            }
            if (!access_token) {
                common_1.Logger.error('未获取到access_token', 'GlobalConfigService');
                return '';
            }
            common_1.Logger.log(`成功获取access_token: ${access_token.substring(0, 10)}...`, 'GlobalConfigService');
            return access_token;
        }
        catch (error) {
            common_1.Logger.error(`获取access_token异常: ${error.message}`, 'GlobalConfigService');
            return '';
        }
    }
    async fetchJsapiTicket(accessToken) {
        if (process.env.ISDEV === 'true') {
            this.wechatJsapiTicket = '';
            return;
        }
        const Url = (0, utils_1.formatUrl)(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
        const res = await axios_1.default.get(`${Url}/cgi-bin/ticket/getticket?access_token=${accessToken}&type=jsapi`);
        return res?.data?.ticket;
    }
    async queryAllConfig(req) {
        const { role } = req.user;
        return this.globalConfigs;
    }
    async queryFrontConfig(query, req) {
        const allowKeys = [
            'registerSendStatus',
            'registerSendModel3Count',
            'registerSendModel4Count',
            'registerSendDrawMjCount',
            'firstRegisterSendStatus',
            'firstRegisterSendRank',
            'firstRegisterSendModel3Count',
            'firstRegisterSendModel4Count',
            'firstRegisterSendDrawMjCount',
            'clientHomePath',
            'clientLogoPath',
            'clientFaviconPath',
            'drawingStyles',
            'isUseWxLogin',
            'siteName',
            'siteUrl',
            'robotAvatar',
            'siteRobotName',
            'buyCramiAddress',
            'mindDefaultData',
            'baiduCode',
            'payEpayChannel',
            'payDuluPayChannel',
            'payMpayChannel',
            'payEpayApiPayUrl',
            'payEpayStatus',
            'payDuluPayStatus',
            'payHupiStatus',
            'payWechatStatus',
            'payDuluPayApiPayUrl',
            'payDuluPayRedirect',
            'payMpayStatus',
            'payLtzfStatus',
            'isAutoOpenNotice',
            'isShowAppCatIcon',
            'salesBaseRatio',
            'salesSeniorRatio',
            'salesAllowDrawMoney',
            'companyName',
            'filingNumber',
            'emailLoginStatus',
            'phoneLoginStatus',
            'openIdentity',
            'openPhoneValidation',
            'wechatRegisterStatus',
            'wechatSilentLoginStatus',
            'oldWechatMigrationStatus',
            'officialOldAccountSuccessText',
            'officialOldAccountFailText',
            'officialOldAccountNotFoundText',
            'signInStatus',
            'signInModel3Count',
            'signInModel4Count',
            'signInMjDrawToken',
            'appMenuHeaderTips',
            'pluginFirst',
            'mjUseBaiduFy',
            'mjHideNotBlock',
            'mjHideWorkIn',
            'isVerifyEmail',
            'showWatermark',
            'showCrami',
            'isHideTts',
            'isHideDefaultPreset',
            'isHideModel3Point',
            'isHideModel4Point',
            'isHideDrawMjPoint',
            'isHidePlugin',
            'model3Name',
            'model4Name',
            'drawMjName',
            'isModelInherited',
            'noVerifyRegister',
            'noticeInfo',
            'homeHtml',
            'isAutoOpenAgreement',
            'agreementInfo',
            'agreementTitle',
            'isEnableExternalLinks',
            'externalLinks',
            'clearCacheEnabled',
            'noticeTitle',
            'streamCacheEnabled',
            'homeWelcomeContent',
            'enableHtmlRender',
            'sideDrawingEditModel',
        ];
        const data = await this.configEntity.find({
            where: { configKey: (0, typeorm_2.In)(allowKeys) },
        });
        const { domain } = query;
        const domainDb = this.globalConfigs['domain'];
        if (domainDb !== domain) {
            this.createOrUpdate({
                configKey: `domain`,
                configVal: domain,
                status: 1,
            });
            await this.initGetAllConfig();
        }
        const publicConfig = data.reduce((prev, cur) => {
            prev[cur.configKey] = cur.configVal;
            return prev;
        }, {});
        const { wechatOfficialAppId, wechatOfficialAppSecret } = await this.getConfigs([
            'wechatOfficialAppId',
            'wechatOfficialAppSecret',
        ]);
        const isUseWxLogin = !!(wechatOfficialAppId && wechatOfficialAppSecret);
        return { ...publicConfig, isUseWxLogin };
    }
    async queryConfig(body, req) {
        const { role } = req.user;
        const { keys } = body;
        const data = await this.configEntity.find({
            where: { configKey: (0, typeorm_2.In)(keys) },
        });
        if (role !== 'super') {
            data.forEach(item => {
                if (item.configKey.includes('mj') ||
                    item.configKey.includes('Key') ||
                    item.configKey.includes('gpt') ||
                    item.configKey.includes('cos') ||
                    item.configKey.includes('baidu') ||
                    item.configKey.includes('ali') ||
                    item.configKey.includes('tencent') ||
                    item.configKey.includes('pay') ||
                    item.configKey.includes('wechat') ||
                    item.configKey.includes('mjProxyImgUrl') ||
                    item.configKey === 'openaiBaseUrl') {
                    const longKeys = ['payWeChatPublicKey', 'payWeChatPrivateKey'];
                    if (longKeys.includes(item.configKey)) {
                        return (item.configVal = (0, utils_1.hideString)(item.configVal, '隐私内容、非超级管理员无权查看'));
                    }
                    const whiteListKey = ['payEpayStatus', 'payHupiStatus', 'mjProxy', 'payLtzfStatus'];
                    if (!whiteListKey.includes(item.configKey) && !item.configKey.includes('Status')) {
                        item.configVal = (0, utils_1.hideString)(item.configVal);
                    }
                }
            });
        }
        return data.reduce((prev, cur) => {
            prev[cur.configKey] = cur.configVal;
            return prev;
        }, {});
    }
    async setConfig(body) {
        try {
            const { settings } = body;
            for (const item of settings) {
                await this.createOrUpdate(item);
            }
            await this.initGetAllConfig();
            const keys = settings.map(t => t.configKey);
            if (keys.includes('baiduTextApiKey') || keys.includes('baiduTextSecretKey')) {
                await this.initBaiduSensitive(false);
            }
            if (keys.includes('wechatOfficialAppId') || keys.includes('wechatOfficialAppSecret')) {
                await this.getWechatAccessToken();
            }
            return '设置完成！';
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async createOrUpdate(setting) {
        try {
            const { configKey, configVal, status = 1 } = setting;
            const c = await this.configEntity.findOne({ where: { configKey } });
            if (c) {
                const res = await this.configEntity.update({ configKey }, { configVal, status });
            }
            else {
                const save = await this.configEntity.save({
                    configKey,
                    configVal,
                    status,
                });
            }
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('设置配置信息错误！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async queryNotice() {
        return await this.getConfigs(['noticeInfo', 'noticeTitle']);
    }
    async queryPayType() {
        const { payHupiStatus = 0, payEpayStatus = 0, payWechatStatus = 0, payMpayStatus = 0, payLtzfStatus = 0, payDuluPayStatus = 0, } = await this.getConfigs([
            'payHupiStatus',
            'payEpayStatus',
            'payMpayStatus',
            'payWechatStatus',
            'payLtzfStatus',
            'payDuluPayStatus',
        ]);
        if ([
            payHupiStatus,
            payEpayStatus,
            payWechatStatus,
            payMpayStatus,
            payLtzfStatus,
            payDuluPayStatus,
        ].every(status => status === 0)) {
            throw new common_1.HttpException('支付功能暂未开放!', common_1.HttpStatus.BAD_REQUEST);
        }
        if (Number(payWechatStatus) === 1) {
            return 'wechat';
        }
        if (Number(payDuluPayStatus) === 1) {
            return 'dulu';
        }
        if (Number(payEpayStatus) === 1) {
            return 'epay';
        }
        if (Number(payMpayStatus) === 1) {
            return 'mpay';
        }
        if (Number(payHupiStatus) === 1) {
            return 'hupi';
        }
        if (Number(payLtzfStatus) === 1) {
            return 'ltzf';
        }
    }
    async getAuthInfo() {
        const { siteName, registerBaseUrl, domain } = await this.getConfigs([
            'siteName',
            'registerBaseUrl',
            'domain',
        ]);
        return { siteName, registerBaseUrl, domain };
    }
    async getPhoneVerifyConfig() {
        const { phoneLoginStatus, aliPhoneAccessKeyId, aliPhoneAccessKeySecret, aliPhoneSignName, aliPhoneTemplateCode, } = await this.getConfigs([
            'phoneLoginStatus',
            'aliPhoneAccessKeyId',
            'aliPhoneAccessKeySecret',
            'aliPhoneSignName',
            'aliPhoneTemplateCode',
        ]);
        if (Number(phoneLoginStatus) !== 1) {
            throw new common_1.HttpException('手机验证码功能暂未开放!', common_1.HttpStatus.BAD_REQUEST);
        }
        return {
            accessKeyId: aliPhoneAccessKeyId,
            accessKeySecret: aliPhoneAccessKeySecret,
            SignName: aliPhoneSignName,
            TemplateCode: aliPhoneTemplateCode,
        };
    }
    getNamespace() {
        return process.env.NAMESPACE || 'AIWeb';
    }
    async getSignatureGiftConfig() {
        const { signInStatus = 0, signInModel3Count = 0, signInModel4Count = 0, signInMjDrawToken = 0, } = await this.getConfigs([
            'signInStatus',
            'signInModel3Count',
            'signInModel4Count',
            'signInMjDrawToken',
        ]);
        if (Number(signInStatus) !== 1) {
            throw new common_1.HttpException('签到功能暂未开放!', common_1.HttpStatus.BAD_REQUEST);
        }
        return {
            model3Count: Number(signInModel3Count),
            model4Count: Number(signInModel4Count),
            drawMjCount: Number(signInMjDrawToken),
        };
    }
    async auth() {
        const api = '';
        const response = await fetch(api, {});
        const responseData = await response.json();
        const { success = true, message } = responseData;
        common_1.Logger.debug('感谢您使用AIWeb，祝您使用愉快~');
    }
    async getSensitiveConfig() {
        const { baiduTextStatus = 0, baiduTextAccessToken } = await this.getConfigs([
            'baiduTextStatus',
            'baiduTextAccessToken',
        ]);
        if (Number(baiduTextStatus) === 1) {
            return {
                useType: 'baidu',
                baiduTextAccessToken,
            };
        }
        return null;
    }
    async saveOldWechatUserList(userList) {
        try {
            const oldWechatUserList = JSON.stringify(userList);
            await this.createOrUpdate({
                configKey: 'oldWechatUserList',
                configVal: oldWechatUserList,
                configDescribe: '账号迁移-旧账号的用户列表',
            });
            this.globalConfigs.oldWechatUserList = oldWechatUserList;
            return true;
        }
        catch (error) {
            common_1.Logger.error(`保存旧账号用户列表失败: ${error.message}`, 'GlobalConfigService');
            throw new common_1.HttpException('保存旧账号用户列表失败', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async saveOpenidMapping(mappingList) {
        try {
            const openidMapping = JSON.stringify(mappingList);
            await this.createOrUpdate({
                configKey: 'openidMapping',
                configVal: openidMapping,
                configDescribe: '账号迁移-OpenID映射关系',
            });
            this.globalConfigs.openidMapping = openidMapping;
            return true;
        }
        catch (error) {
            common_1.Logger.error(`保存OpenID映射关系失败: ${error.message}`, 'GlobalConfigService');
            throw new common_1.HttpException('保存OpenID映射关系失败', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getOldWechatUserList() {
        try {
            const oldWechatUserList = this.globalConfigs.oldWechatUserList;
            if (!oldWechatUserList) {
                return null;
            }
            return JSON.parse(oldWechatUserList);
        }
        catch (error) {
            common_1.Logger.error(`获取旧账号用户列表失败: ${error.message}`, 'GlobalConfigService');
            return null;
        }
    }
    async getOpenidMapping() {
        try {
            const openidMapping = this.globalConfigs.openidMapping;
            if (!openidMapping) {
                return null;
            }
            return JSON.parse(openidMapping);
        }
        catch (error) {
            common_1.Logger.error(`获取OpenID映射关系失败: ${error.message}`, 'GlobalConfigService');
            return null;
        }
    }
    async saveUnionidMapping(mappingData) {
        try {
            let currentMapping = (await this.getOpenidMapping()) || {};
            if (!currentMapping.unionid_mapping) {
                currentMapping.unionid_mapping = {};
            }
            currentMapping.unionid_mapping = {
                ...currentMapping.unionid_mapping,
                ...mappingData,
            };
            const openidMapping = JSON.stringify(currentMapping);
            await this.createOrUpdate({
                configKey: 'openidMapping',
                configVal: openidMapping,
                configDescribe: '账号迁移-OpenID和UnionID映射关系',
            });
            this.globalConfigs.openidMapping = openidMapping;
            common_1.Logger.log(`保存了${Object.keys(mappingData).length}个UnionID映射关系`, 'GlobalConfigService');
            return true;
        }
        catch (error) {
            common_1.Logger.error(`保存UnionID映射关系失败: ${error.message}`, 'GlobalConfigService');
            throw new common_1.HttpException('保存UnionID映射关系失败', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.GlobalConfigService = GlobalConfigService;
exports.GlobalConfigService = GlobalConfigService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(chatLog_entity_1.ChatLogEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof models_service_1.ModelsService !== "undefined" && models_service_1.ModelsService) === "function" ? _c : Object])
], GlobalConfigService);


/***/ }),
/* 75 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatLogEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let ChatLogEntity = class ChatLogEntity extends baseEntity_1.BaseEntity {
    userId;
    model;
    role;
    content;
    reasoning_content;
    tool_calls;
    imageUrl;
    videoUrl;
    audioUrl;
    fileUrl;
    type;
    modelName;
    modelAvatar;
    curIp;
    prompt;
    extraParam;
    pluginParam;
    answer;
    promptTokens;
    completionTokens;
    totalTokens;
    progress;
    status;
    action;
    customId;
    drawId;
    ttsUrl;
    rec;
    groupId;
    appId;
    isDelete;
    taskId;
    taskData;
    fileInfo;
    promptReference;
    networkSearchResult;
    fileVectorResult;
};
exports.ChatLogEntity = ChatLogEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用的模型', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "model", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'role system user assistant', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型内容', nullable: true, type: 'mediumtext' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型推理内容', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "reasoning_content", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型工具调用', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "tool_calls", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '图片Url', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "imageUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '视频Url', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "videoUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '音频Url', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "audioUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '文件Url', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "fileUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '使用类型1: 普通对话 2: 绘图 3: 拓展性对话',
        nullable: true,
        default: 1,
    }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '自定义的模型名称', nullable: true, default: 'AI' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "modelName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '自定义的模型头像', nullable: false, default: '' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "modelAvatar", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'Ip地址', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "curIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '询问的问题', type: 'text', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '附加参数', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "extraParam", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '插件参数', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "pluginParam", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '回答的答案', type: 'text', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "answer", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '提问的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "promptTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '回答的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "completionTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '总花费的token', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "totalTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '任务进度', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "progress", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '任务状态', nullable: true, default: 3 }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '任务类型', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '对图片操作的按钮ID', type: 'text', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "customId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绘画的ID每条不一样', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "drawId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '对话转语音的链接', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "ttsUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否推荐0: 默认 1: 推荐', nullable: true, default: 0 }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "rec", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分组ID', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "groupId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用的应用id', nullable: true }),
    __metadata("design:type", Number)
], ChatLogEntity.prototype, "appId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否删除', default: false }),
    __metadata("design:type", Boolean)
], ChatLogEntity.prototype, "isDelete", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '任务ID', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "taskId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '任务数据', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "taskData", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '文件信息', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "fileInfo", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '提问参考', nullable: true }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "promptReference", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '联网搜索结果', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "networkSearchResult", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '文件向量搜索结果', nullable: true, type: 'mediumtext' }),
    __metadata("design:type", String)
], ChatLogEntity.prototype, "fileVectorResult", void 0);
exports.ChatLogEntity = ChatLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'chatlog' })
], ChatLogEntity);


/***/ }),
/* 76 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ModelsService = void 0;
const status_constant_1 = __webpack_require__(77);
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const models_entity_1 = __webpack_require__(78);
let ModelsService = class ModelsService {
    modelsEntity;
    constructor(modelsEntity) {
        this.modelsEntity = modelsEntity;
    }
    modelTypes = [];
    modelMaps = {};
    keyList = {};
    keyPoolMap = {};
    keyPoolIndexMap = {};
    async onModuleInit() {
        await this.initCalcKey();
    }
    async initCalcKey() {
        this.keyPoolMap = {};
        this.keyPoolIndexMap = {};
        this.keyList = {};
        this.modelMaps = {};
        this.modelTypes = [];
        const allKeys = await this.modelsEntity.find();
        const keyTypes = allKeys.reduce((pre, cur) => {
            if (!pre[cur.keyType]) {
                pre[cur.keyType] = [cur];
            }
            else {
                pre[cur.keyType].push(cur);
            }
            return pre;
        }, {});
        this.modelTypes = Object.keys(keyTypes).map(keyType => {
            return { label: status_constant_1.ModelsMapCn[keyType], val: keyType };
        });
        this.modelMaps = keyTypes;
        this.keyList = {};
        allKeys.forEach(keyDetail => {
            const { keyType, model } = keyDetail;
            if (!this.keyPoolMap[model])
                this.keyPoolMap[model] = [];
            this.keyPoolMap[model].push(keyDetail);
            if (!this.keyPoolIndexMap[model])
                this.keyPoolIndexMap[model] = 0;
            if (!this.keyList[keyType])
                this.keyList[keyType] = {};
            if (!this.keyList[keyType][model])
                this.keyList[keyType][model] = [];
            this.keyList[keyType][model].push(keyDetail);
        });
    }
    async getCurrentModelKeyInfo(model) {
        const modelKeyInfo = await this.modelsEntity.findOne({
            where: { model: model },
        });
        if (!modelKeyInfo) {
            return null;
        }
        return modelKeyInfo;
    }
    async getSpecialModelKeyInfo(modelPrefix) {
        const matchingModels = await this.modelsEntity.find({
            where: { model: (0, typeorm_2.Like)(`${modelPrefix}%`) },
        });
        if (matchingModels.length === 0) {
            throw new common_1.HttpException('未找到匹配的模型，请重新选择模型！', common_1.HttpStatus.BAD_REQUEST);
        }
        const firstMatchModel = matchingModels[0];
        const modifiedModelName = firstMatchModel.model.replace(modelPrefix, '');
        const modifiedModel = {
            ...firstMatchModel,
            model: modifiedModelName,
        };
        return modifiedModel;
    }
    async getBaseConfig() {
        if (!this.modelTypes.length || !Object.keys(this.modelMaps).length)
            return;
        let minOrderModel = null;
        let minOrder = Infinity;
        for (const keyType in this.modelMaps) {
            for (const model of this.modelMaps[keyType]) {
                if (model.status === true && model.modelOrder < minOrder) {
                    minOrder = model.modelOrder;
                    minOrderModel = model;
                }
            }
        }
        if (!minOrderModel && this.modelMaps[1] && this.modelMaps[1][0]) {
            minOrderModel = this.modelMaps[1][0];
        }
        if (!minOrderModel)
            return;
        const { keyType, modelName, model, deductType, deduct, isFileUpload, isImageUpload, modelAvatar, modelDescription, isNetworkSearch, deepThinkingType, deductDeepThink, isMcpTool, systemPrompt, systemPromptType, } = minOrderModel;
        return {
            modelInfo: {
                keyType,
                modelName,
                model,
                deductType,
                deduct,
                isFileUpload,
                isImageUpload,
                modelAvatar,
                modelDescription,
                isNetworkSearch,
                deepThinkingType,
                deductDeepThink,
                isMcpTool,
                systemPrompt,
                systemPromptType,
            },
        };
    }
    async setModel(params) {
        try {
            if (isNaN(params.timeout)) {
                params.timeout = null;
            }
            const { id } = params;
            if (id) {
                const res = await this.modelsEntity.update({ id }, params);
                await this.initCalcKey();
                return res.affected > 0;
            }
            else {
                const { keyType, key } = params;
                if (Number(keyType !== 1)) {
                    const res = await this.modelsEntity.save(params);
                    await this.initCalcKey();
                    return res;
                }
                else {
                    const data = key.map(k => {
                        try {
                            const data = JSON.parse(JSON.stringify(params));
                            data.key = k;
                            if (isNaN(data.timeout)) {
                                data.timeout = null;
                            }
                            return data;
                        }
                        catch (error) {
                            console.log('parse error: ', error);
                        }
                    });
                    const res = await this.modelsEntity.save(data);
                    await this.initCalcKey();
                    return res;
                }
            }
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async delModel({ id }) {
        if (!id) {
            throw new common_1.HttpException('缺失必要参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        const m = await this.modelsEntity.findOne({ where: { id } });
        if (!m) {
            throw new common_1.HttpException('当前账号不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.modelsEntity.delete({ id });
        await this.initCalcKey();
        return res;
    }
    async queryModels(req, params) {
        const { role } = req.user;
        const { keyType, key, status, model, page = 1, size = 10 } = params;
        const where = {};
        keyType && (where.keyType = keyType);
        model && (where.model = model);
        status && (where.status = Number(status) === 1 ? true : false);
        key && (where.key = (0, typeorm_2.Like)(`%${key}%`));
        const [rows, count] = await this.modelsEntity.findAndCount({
            where: where,
            order: {
                modelOrder: 'ASC',
            },
            skip: (page - 1) * size,
            take: size,
        });
        if (role !== 'super') {
            rows.forEach(item => {
                item.key && (item.key = (0, utils_1.hideString)(item.key));
            });
        }
        return { rows, count };
    }
    async modelsList() {
        const cloneModelMaps = JSON.parse(JSON.stringify(this.modelMaps));
        Object.keys(cloneModelMaps).forEach(key => {
            cloneModelMaps[key] = cloneModelMaps[key]
                .filter(t => t.status === true)
                .sort((a, b) => a.modelOrder - b.modelOrder);
            cloneModelMaps[key] = Array.from(cloneModelMaps[key]
                .map(t => {
                const { modelName, keyType, model, deduct, deductType, maxRounds, modelAvatar, isFileUpload, isImageUpload, modelDescription, isNetworkSearch, deepThinkingType, deductDeepThink, isMcpTool, } = t;
                return {
                    modelName,
                    keyType,
                    model,
                    deduct,
                    deductType,
                    maxRounds,
                    modelAvatar,
                    isFileUpload,
                    isImageUpload,
                    modelDescription,
                    isNetworkSearch,
                    deepThinkingType,
                    deductDeepThink,
                    isMcpTool,
                };
            })
                .reduce((map, obj) => map.set(obj.modelName, obj), new Map())
                .values());
        });
        return {
            modelTypeList: this.modelTypes,
            modelMaps: cloneModelMaps,
        };
    }
    async saveUseLog(id, useToken) {
        await this.modelsEntity
            .createQueryBuilder()
            .update(models_entity_1.ModelsEntity)
            .set({
            useCount: () => 'useCount + 1',
            useToken: () => `useToken + ${useToken}`,
        })
            .where('id = :id', { id })
            .execute();
    }
    async getAllKey() {
        return await this.modelsEntity.find();
    }
    async queryModelType(params) {
        return 1;
    }
    async setModelType(params) {
        return 1;
    }
    async delModelType(params) {
        return 1;
    }
    async getModelDetailByName(model) {
        common_1.Logger.debug(`getModelDetailByName:${model}`);
        if (!model) {
            throw new common_1.HttpException('模型名称不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            let modelDetail = await this.modelsEntity.findOne({
                where: { model: model },
            });
            if (!modelDetail) {
                const models = await this.modelsEntity.find({
                    where: { model: (0, typeorm_2.Like)(`%${model}%`) },
                });
                if (models.length > 0) {
                    modelDetail = models[0];
                }
            }
            common_1.Logger.debug(`modelDetail: ${modelDetail}`);
            if (!modelDetail) {
                throw new common_1.HttpException('未找到指定模型', common_1.HttpStatus.NOT_FOUND);
            }
            return {
                id: modelDetail.id,
                modelName: modelDetail.modelName,
                model: modelDetail.model,
                keyType: modelDetail.keyType,
                deduct: modelDetail.deduct,
                deductType: modelDetail.deductType,
                maxRounds: modelDetail.maxRounds,
                modelAvatar: modelDetail.modelAvatar,
                isFileUpload: modelDetail.isFileUpload,
                isImageUpload: modelDetail.isImageUpload,
                modelDescription: modelDetail.modelDescription,
                isNetworkSearch: modelDetail.isNetworkSearch,
                deepThinkingType: modelDetail.deepThinkingType,
                deductDeepThink: modelDetail.deductDeepThink,
                modelOrder: modelDetail.modelOrder,
                isMcpTool: modelDetail.isMcpTool,
                systemPrompt: modelDetail.systemPrompt,
                systemPromptType: modelDetail.systemPromptType,
                drawingType: modelDetail.drawingType,
            };
        }
        catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            common_1.Logger.error(`获取模型详情失败: ${error.message}`, 'ModelsService');
            throw new common_1.HttpException('获取模型详情失败', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.ModelsService = ModelsService;
exports.ModelsService = ModelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(models_entity_1.ModelsEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object])
], ModelsService);


/***/ }),
/* 77 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ModelsMapCn = exports.VerificationUseStatusEnum = void 0;
var VerificationUseStatusEnum;
(function (VerificationUseStatusEnum) {
    VerificationUseStatusEnum[VerificationUseStatusEnum["UNUSED"] = 0] = "UNUSED";
    VerificationUseStatusEnum[VerificationUseStatusEnum["USED"] = 1] = "USED";
})(VerificationUseStatusEnum || (exports.VerificationUseStatusEnum = VerificationUseStatusEnum = {}));
exports.ModelsMapCn = {
    1: '普通模型',
    2: '绘画模型',
    3: '特殊模型',
};


/***/ }),
/* 78 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ModelsEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let ModelsEntity = class ModelsEntity extends baseEntity_1.BaseEntity {
    keyType;
    modelName;
    model;
    modelAvatar;
    modelOrder;
    maxModelTokens;
    max_tokens;
    maxRounds;
    timeout;
    deduct;
    deductDeepThink;
    deductType;
    isTokenBased;
    isFileUpload;
    isImageUpload;
    tokenFeeRatio;
    remark;
    key;
    status;
    useCount;
    useToken;
    proxyUrl;
    modelLimits;
    modelDescription;
    isNetworkSearch;
    deepThinkingType;
    isMcpTool;
    systemPrompt;
    systemPromptType;
    drawingType;
};
exports.ModelsEntity = ModelsEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '模型类型 1: 普通对话 2: 绘画  3:高级对话' }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "keyType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型名称' }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "modelName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绑定的模型是？' }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "model", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 1024, comment: '模型头像', nullable: true }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "modelAvatar", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型排序', default: 1 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "modelOrder", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '模型上下文支持的最大Tokens',
        default: 64000,
        nullable: true,
    }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "maxModelTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型回复最大Tokens', default: 4096, nullable: true }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "max_tokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型上下文最大条数', nullable: true }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "maxRounds", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型上下文最大条数', nullable: true }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "timeout", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型单次调用扣除的次数', default: 1 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "deduct", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型开启深度思考后积分扣除的系数', default: 1 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "deductDeepThink", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型扣除余额类型 1: 普通模型 2: 高级模型', default: 1 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "deductType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否使用token计费: 0:不是 1: 是', default: 0 }),
    __metadata("design:type", Boolean)
], ModelsEntity.prototype, "isTokenBased", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '文件解析: 0:不使用 1:逆向格式(直接附带链接,仅支持逆向渠道) 2:向量解析(内置文件分析,支持全模型分析带文字的文件)',
        default: 0,
    }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "isFileUpload", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '图片解析: 0:不使用 1:逆向格式(直接附带链接,仅支持逆向渠道) 2:GPT Vision 3:全局解析(支持所有格式的图片解析)',
        default: 0,
    }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "isImageUpload", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'token计费比例', default: 0 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "tokenFeeRatio", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型附加信息', nullable: true }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "remark", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型的key', nullable: true }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "key", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '使用的状态: 0:禁用 1：启用', default: 1 }),
    __metadata("design:type", Boolean)
], ModelsEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的使用次数', default: 0 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "useCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'key的已经使用的token数量', default: 0 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "useToken", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前模型的代理地址', nullable: true }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "proxyUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型频率限制 次/小时', default: 999 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "modelLimits", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型介绍', nullable: true }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "modelDescription", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '开启联网搜索', nullable: true, default: true }),
    __metadata("design:type", Boolean)
], ModelsEntity.prototype, "isNetworkSearch", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '深度思考类型 0:关闭 1:全局思考 2:模型思考', nullable: true, default: 0 }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "deepThinkingType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否支持MCP工具', nullable: true, default: false }),
    __metadata("design:type", Boolean)
], ModelsEntity.prototype, "isMcpTool", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型system预设', nullable: true }),
    __metadata("design:type", String)
], ModelsEntity.prototype, "systemPrompt", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '预设类型 0:关闭预设 1: 附加模式 2: 覆盖模式',
        nullable: true,
        default: 0,
    }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "systemPromptType", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '绘画类型: 0:不是绘画 1:dalle兼容 2:gpt-image-1兼容 3:midjourney 4:chat正则提取 5:豆包',
        nullable: true,
        default: 0,
    }),
    __metadata("design:type", Number)
], ModelsEntity.prototype, "drawingType", void 0);
exports.ModelsEntity = ModelsEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'models' })
], ModelsEntity);


/***/ }),
/* 79 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AccountLogEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let AccountLogEntity = class AccountLogEntity extends baseEntity_1.BaseEntity {
    userId;
    pkgName;
    rebateUserId;
    packageId;
    memberDays;
    rechargeType;
    model3Count;
    model4Count;
    drawMjCount;
    days;
    uid;
    extent;
};
exports.AccountLogEntity = AccountLogEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '会员套餐名称', nullable: true }),
    __metadata("design:type", String)
], AccountLogEntity.prototype, "pkgName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '推荐人ID、返佣用户ID', nullable: true }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "rebateUserId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '充值套餐ID', nullable: true }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "packageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '会员有效天数', nullable: true }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "memberDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '账户充值类型' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "rechargeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型3对话次数' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "model3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型4对话次数' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "model4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'MJ绘画次数' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "drawMjCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐有效期' }),
    __metadata("design:type", Number)
], AccountLogEntity.prototype, "days", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '随机订单uid' }),
    __metadata("design:type", String)
], AccountLogEntity.prototype, "uid", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '扩展字段', nullable: true }),
    __metadata("design:type", String)
], AccountLogEntity.prototype, "extent", void 0);
exports.AccountLogEntity = AccountLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'account_log' })
], AccountLogEntity);


/***/ }),
/* 80 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BalanceEntity = void 0;
const typeorm_1 = __webpack_require__(3);
const baseEntity_1 = __webpack_require__(72);
let BalanceEntity = class BalanceEntity extends baseEntity_1.BaseEntity {
    userId;
    balance;
    usesLeft;
    paintCount;
    useTokens;
    useChats;
    usePaints;
};
exports.BalanceEntity = BalanceEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], BalanceEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户账户余额' }),
    __metadata("design:type", Number)
], BalanceEntity.prototype, "balance", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户使用次数余额' }),
    __metadata("design:type", Number)
], BalanceEntity.prototype, "usesLeft", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '绘画使用次数余额' }),
    __metadata("design:type", Number)
], BalanceEntity.prototype, "paintCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, comment: '用户总计使用的token数量' }),
    __metadata("design:type", Number)
], BalanceEntity.prototype, "useTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, comment: '用户总计使用的对话次数' }),
    __metadata("design:type", Number)
], BalanceEntity.prototype, "useChats", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, comment: '用户总计使用的绘画次数' }),
    __metadata("design:type", Number)
], BalanceEntity.prototype, "usePaints", void 0);
exports.BalanceEntity = BalanceEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'balance' })
], BalanceEntity);


/***/ }),
/* 81 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserBalanceEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let UserBalanceEntity = class UserBalanceEntity extends baseEntity_1.BaseEntity {
    userId;
    model3Count;
    model4Count;
    drawMjCount;
    packageId;
    memberModel3Count;
    memberModel4Count;
    memberDrawMjCount;
    useModel3Count;
    useModel4Count;
    useModel3Token;
    useModel4Token;
    useDrawMjToken;
    extent;
    expirationTime;
    appCats;
};
exports.UserBalanceEntity = UserBalanceEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '充值的套餐包含的模型3次数', nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "model3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '充值的套餐包含的模型4次数', nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "model4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '充值的套餐包含的MJ绘画次数', nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "drawMjCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '当前使用的套餐ID', default: 0, nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "packageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '会员模型3额度', default: 0, nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "memberModel3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '会员模型4额度', default: 0, nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "memberModel4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '会员MJ绘画额度', default: 0, nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "memberDrawMjCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '已经使用的对话3的模型次数', nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "useModel3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '已经使用的对话4的模型次数', nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "useModel4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '已经使用的对话3的模型Token', nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "useModel3Token", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '已经使用的对话4的模型Token', nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "useModel4Token", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '已经使用的MJ绘画Token', nullable: true }),
    __metadata("design:type", Number)
], UserBalanceEntity.prototype, "useDrawMjToken", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '扩展字段', nullable: true }),
    __metadata("design:type", String)
], UserBalanceEntity.prototype, "extent", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '会员到期时间', nullable: true }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], UserBalanceEntity.prototype, "expirationTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐应用分类列表', nullable: true, default: '' }),
    __metadata("design:type", String)
], UserBalanceEntity.prototype, "appCats", void 0);
exports.UserBalanceEntity = UserBalanceEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'user_balances' })
], UserBalanceEntity);


/***/ }),
/* 82 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatGroupEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let ChatGroupEntity = class ChatGroupEntity extends baseEntity_1.BaseEntity {
    userId;
    isSticky;
    title;
    appId;
    isDelete;
    config;
    params;
    fileUrl;
    pdfTextContent;
};
exports.ChatGroupEntity = ChatGroupEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], ChatGroupEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否置顶聊天', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], ChatGroupEntity.prototype, "isSticky", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '分组名称', nullable: true }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '应用ID', nullable: true }),
    __metadata("design:type", Number)
], ChatGroupEntity.prototype, "appId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否删除了', default: false }),
    __metadata("design:type", Boolean)
], ChatGroupEntity.prototype, "isDelete", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '配置', nullable: true, default: null, type: 'text' }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "config", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '附加参数', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "params", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '文件链接', nullable: true, default: null, type: 'text' }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "fileUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'PDF中的文字内容', nullable: true, type: 'mediumtext' }),
    __metadata("design:type", String)
], ChatGroupEntity.prototype, "pdfTextContent", void 0);
exports.ChatGroupEntity = ChatGroupEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'chat_group' })
], ChatGroupEntity);


/***/ }),
/* 83 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let UserEntity = class UserEntity extends baseEntity_1.BaseEntity {
    username;
    password;
    status;
    sex;
    nickname;
    email;
    phone;
    avatar;
    sign;
    registerIp;
    lastLoginIp;
    inviteCode;
    invitedBy;
    role;
    openId;
    client;
    inviteLinkCount;
    consecutiveDays;
    violationCount;
    realName;
    idCard;
};
exports.UserEntity = UserEntity;
__decorate([
    (0, typeorm_1.Column)({ length: 12, comment: '用户昵称' }),
    __metadata("design:type", String)
], UserEntity.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, comment: '用户密码', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "password", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, comment: '用户状态' }),
    __metadata("design:type", Number)
], UserEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '用户性别' }),
    __metadata("design:type", Number)
], UserEntity.prototype, "sex", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户昵称', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "nickname", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, unique: true, comment: '用户邮箱' }),
    __metadata("design:type", String)
], UserEntity.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: true, comment: '用户手机号' }),
    __metadata("design:type", String)
], UserEntity.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({
        length: 300,
        nullable: true,
        default: '',
        comment: '用户头像',
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "avatar", void 0);
__decorate([
    (0, typeorm_1.Column)({
        length: 300,
        nullable: true,
        default: '我是一台基于深度学习和自然语言处理技术的 AI 机器人，旨在为用户提供高效、精准、个性化的智能服务。',
        comment: '用户签名',
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "sign", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, default: '', comment: '注册IP', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "registerIp", void 0);
__decorate([
    (0, typeorm_1.Column)({
        length: 64,
        default: '',
        comment: '最后一次登录IP',
        nullable: true,
    }),
    __metadata("design:type", String)
], UserEntity.prototype, "lastLoginIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: '', comment: '用户邀请码' }),
    __metadata("design:type", String)
], UserEntity.prototype, "inviteCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: '', comment: '用户填写的别人的邀请码' }),
    __metadata("design:type", String)
], UserEntity.prototype, "invitedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 10, default: 'viewer', comment: '用户角色' }),
    __metadata("design:type", String)
], UserEntity.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, default: '', comment: '微信openId', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "openId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, comment: '用户注册来源', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "client", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户邀请链接被点击次数', default: 0 }),
    __metadata("design:type", Number)
], UserEntity.prototype, "inviteLinkCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户连续签到天数', default: 0 }),
    __metadata("design:type", Number)
], UserEntity.prototype, "consecutiveDays", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户违规记录次数', default: 0 }),
    __metadata("design:type", Number)
], UserEntity.prototype, "violationCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '真实姓名', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "realName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '身份证号', nullable: true }),
    __metadata("design:type", String)
], UserEntity.prototype, "idCard", void 0);
exports.UserEntity = UserEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'users' })
], UserEntity);


/***/ }),
/* 84 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FingerprintLogEntity = void 0;
const typeorm_1 = __webpack_require__(3);
const baseEntity_1 = __webpack_require__(72);
let FingerprintLogEntity = class FingerprintLogEntity extends baseEntity_1.BaseEntity {
    fingerprint;
    model3Count;
    model4Count;
    drawMjCount;
};
exports.FingerprintLogEntity = FingerprintLogEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '指纹ID' }),
    __metadata("design:type", String)
], FingerprintLogEntity.prototype, "fingerprint", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型3对话次数' }),
    __metadata("design:type", Number)
], FingerprintLogEntity.prototype, "model3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '模型4对话次数' }),
    __metadata("design:type", Number)
], FingerprintLogEntity.prototype, "model4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'MJ绘画次数' }),
    __metadata("design:type", Number)
], FingerprintLogEntity.prototype, "drawMjCount", void 0);
exports.FingerprintLogEntity = FingerprintLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'fingerprint_log' })
], FingerprintLogEntity);


/***/ }),
/* 85 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const jwtAuth_guard_1 = __webpack_require__(87);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const app_service_1 = __webpack_require__(105);
const collectApp_dto_1 = __webpack_require__(109);
const createApp_dto_1 = __webpack_require__(111);
const createCats_dto_1 = __webpack_require__(112);
const deleteApp_dto_1 = __webpack_require__(113);
const deleteCats_dto_1 = __webpack_require__(114);
const queryApp_dto_1 = __webpack_require__(115);
const queryCats_dto_1 = __webpack_require__(116);
const updateApp_dto_1 = __webpack_require__(117);
const updateCats_dto_1 = __webpack_require__(118);
let AppController = class AppController {
    appService;
    constructor(appService) {
        this.appService = appService;
    }
    appCatsList(query, req) {
        return this.appService.appCatsList(query, req);
    }
    catsList(req) {
        const params = { status: 1, page: 1, size: 1000, name: '' };
        return this.appService.appCatsList(params, req);
    }
    queryOneCats(query, req) {
        return this.appService.queryOneCat(query, req);
    }
    createAppCat(body) {
        return this.appService.createAppCat(body);
    }
    updateAppCats(body) {
        return this.appService.updateAppCats(body);
    }
    delAppCat(body) {
        return this.appService.delAppCat(body);
    }
    appList(req, query) {
        return this.appService.appList(req, query);
    }
    list(req, query) {
        return this.appService.frontAppList(req, query);
    }
    async searchList(body, req) {
        body.userId = req.user.id;
        return this.appService.searchAppList(body);
    }
    createApp(body) {
        return this.appService.createApp(body);
    }
    updateApp(body) {
        return this.appService.updateApp(body);
    }
    delApp(body) {
        return this.appService.delApp(body);
    }
    collect(body, req) {
        return this.appService.collect(body, req);
    }
    mineApps(req) {
        return this.appService.mineApps(req);
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)('queryAppCats'),
    (0, swagger_1.ApiOperation)({ summary: '获取App分类列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof queryCats_dto_1.QuerCatsDto !== "undefined" && queryCats_dto_1.QuerCatsDto) === "function" ? _b : Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "appCatsList", null);
__decorate([
    (0, common_1.Get)('queryCats'),
    (0, swagger_1.ApiOperation)({ summary: '用户端获取App分类列表' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "catsList", null);
__decorate([
    (0, common_1.Get)('queryOneCat'),
    (0, swagger_1.ApiOperation)({ summary: '用户端获取App详情' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "queryOneCats", null);
__decorate([
    (0, common_1.Post)('createAppCats'),
    (0, swagger_1.ApiOperation)({ summary: '添加App分类' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof createCats_dto_1.CreateCatsDto !== "undefined" && createCats_dto_1.CreateCatsDto) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "createAppCat", null);
__decorate([
    (0, common_1.Post)('updateAppCats'),
    (0, swagger_1.ApiOperation)({ summary: '修改App分类' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof updateCats_dto_1.UpdateCatsDto !== "undefined" && updateCats_dto_1.UpdateCatsDto) === "function" ? _g : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "updateAppCats", null);
__decorate([
    (0, common_1.Post)('delAppCats'),
    (0, swagger_1.ApiOperation)({ summary: '删除App分类' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_h = typeof deleteCats_dto_1.DeleteCatsDto !== "undefined" && deleteCats_dto_1.DeleteCatsDto) === "function" ? _h : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "delAppCat", null);
__decorate([
    (0, common_1.Get)('queryApp'),
    (0, swagger_1.ApiOperation)({ summary: '获取App列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_j = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _j : Object, typeof (_k = typeof queryApp_dto_1.QuerAppDto !== "undefined" && queryApp_dto_1.QuerAppDto) === "function" ? _k : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "appList", null);
__decorate([
    (0, common_1.Get)('list'),
    (0, swagger_1.ApiOperation)({ summary: '客户端获取App' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_l = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _l : Object, typeof (_m = typeof queryApp_dto_1.QuerAppDto !== "undefined" && queryApp_dto_1.QuerAppDto) === "function" ? _m : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('searchList'),
    (0, swagger_1.ApiOperation)({ summary: '客户端获取App' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_o = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _o : Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "searchList", null);
__decorate([
    (0, common_1.Post)('createApp'),
    (0, swagger_1.ApiOperation)({ summary: '添加App' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_p = typeof createApp_dto_1.CreateAppDto !== "undefined" && createApp_dto_1.CreateAppDto) === "function" ? _p : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "createApp", null);
__decorate([
    (0, common_1.Post)('updateApp'),
    (0, swagger_1.ApiOperation)({ summary: '修改App' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_q = typeof updateApp_dto_1.UpdateAppDto !== "undefined" && updateApp_dto_1.UpdateAppDto) === "function" ? _q : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "updateApp", null);
__decorate([
    (0, common_1.Post)('delApp'),
    (0, swagger_1.ApiOperation)({ summary: '删除App' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_r = typeof deleteApp_dto_1.OperateAppDto !== "undefined" && deleteApp_dto_1.OperateAppDto) === "function" ? _r : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "delApp", null);
__decorate([
    (0, common_1.Post)('collect'),
    (0, swagger_1.ApiOperation)({ summary: '收藏/取消收藏App' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_s = typeof collectApp_dto_1.CollectAppDto !== "undefined" && collectApp_dto_1.CollectAppDto) === "function" ? _s : Object, typeof (_t = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _t : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "collect", null);
__decorate([
    (0, common_1.Get)('mineApps'),
    (0, swagger_1.ApiOperation)({ summary: '我的收藏' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_u = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _u : Object]),
    __metadata("design:returntype", void 0)
], AppController.prototype, "mineApps", null);
exports.AppController = AppController = __decorate([
    (0, swagger_1.ApiTags)('app'),
    (0, common_1.Controller)('app'),
    __metadata("design:paramtypes", [typeof (_a = typeof app_service_1.AppService !== "undefined" && app_service_1.AppService) === "function" ? _a : Object])
], AppController);


/***/ }),
/* 86 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AdminAuthGuard = void 0;
const common_1 = __webpack_require__(2);
const jwtAuth_guard_1 = __webpack_require__(87);
let AdminAuthGuard = class AdminAuthGuard extends jwtAuth_guard_1.JwtAuthGuard {
    async canActivate(context) {
        const isAuthorized = await super.canActivate(context);
        if (!isAuthorized) {
            return false;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (user && ['admin', 'super'].includes(user.role)) {
            return true;
        }
        else {
            throw new common_1.UnauthorizedException('非法操作、您的权限等级不足、无法执行当前请求！');
        }
    }
};
exports.AdminAuthGuard = AdminAuthGuard;
exports.AdminAuthGuard = AdminAuthGuard = __decorate([
    (0, common_1.Injectable)()
], AdminAuthGuard);


/***/ }),
/* 87 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JwtAuthGuard = void 0;
const globalConfig_service_1 = __webpack_require__(74);
const redisCache_service_1 = __webpack_require__(28);
const common_1 = __webpack_require__(2);
const core_1 = __webpack_require__(13);
const passport_1 = __webpack_require__(88);
const jwt = __webpack_require__(89);
const auth_service_1 = __webpack_require__(90);
let JwtAuthGuard = class JwtAuthGuard extends (0, passport_1.AuthGuard)('jwt') {
    redisCacheService;
    moduleRef;
    globalConfigService;
    authService;
    constructor(redisCacheService, moduleRef, globalConfigService, authService) {
        super();
        this.redisCacheService = redisCacheService;
        this.moduleRef = moduleRef;
        this.globalConfigService = globalConfigService;
        this.authService = authService;
    }
    async canActivate(context) {
        if (!this.redisCacheService) {
            this.redisCacheService = this.moduleRef.get(redisCache_service_1.RedisCacheService, {
                strict: false,
            });
        }
        const request = context.switchToHttp().getRequest();
        const _domain = request.headers.host;
        const token = this.extractToken(request);
        request.user = await this.validateToken(token);
        await this.redisCacheService.checkTokenAuth(token, request);
        return true;
    }
    extractToken(request) {
        if (!request.headers.authorization) {
            if (request.headers.fingerprint) {
                let id = request.headers.fingerprint;
                if (id > 2147483647) {
                    id = id.toString().slice(-9);
                    id = Number(String(Number(id)));
                }
                const token = this.authService.createTokenFromFingerprint(id);
                return token;
            }
            return null;
        }
        const parts = request.headers.authorization.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }
        return parts[1];
    }
    async validateToken(token) {
        try {
            const secret = await this.redisCacheService.getJwtSecret();
            const decoded = await jwt.verify(token, secret);
            return decoded;
        }
        catch (error) {
            common_1.Logger.debug('用户信息校验失败', 'JwtAuthGuard');
            throw new common_1.HttpException('亲爱的用户,请登录后继续操作,我们正在等您的到来！', common_1.HttpStatus.UNAUTHORIZED);
        }
    }
    handleRequest(err, user, info) {
        if (err || !user) {
            console.log('err: ', err);
            throw err || new common_1.UnauthorizedException();
        }
        return user;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof redisCache_service_1.RedisCacheService !== "undefined" && redisCache_service_1.RedisCacheService) === "function" ? _a : Object, typeof (_b = typeof core_1.ModuleRef !== "undefined" && core_1.ModuleRef) === "function" ? _b : Object, typeof (_c = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _c : Object, typeof (_d = typeof auth_service_1.AuthService !== "undefined" && auth_service_1.AuthService) === "function" ? _d : Object])
], JwtAuthGuard);


/***/ }),
/* 88 */
/***/ ((module) => {

module.exports = require("@nestjs/passport");

/***/ }),
/* 89 */
/***/ ((module) => {

module.exports = require("jsonwebtoken");

/***/ }),
/* 90 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthService = void 0;
const user_constant_1 = __webpack_require__(91);
const utils_1 = __webpack_require__(36);
const globalConfig_service_1 = __webpack_require__(74);
const common_1 = __webpack_require__(2);
const jwt_1 = __webpack_require__(92);
const typeorm_1 = __webpack_require__(33);
const bcrypt = __webpack_require__(93);
const os = __webpack_require__(94);
const typeorm_2 = __webpack_require__(3);
const config_entity_1 = __webpack_require__(73);
const mailer_service_1 = __webpack_require__(95);
const redisCache_service_1 = __webpack_require__(28);
const user_service_1 = __webpack_require__(97);
const userBalance_service_1 = __webpack_require__(34);
const verification_service_1 = __webpack_require__(100);
let AuthService = class AuthService {
    configEntity;
    userService;
    jwtService;
    mailerService;
    verificationService;
    userBalanceService;
    redisCacheService;
    globalConfigService;
    ipAddress;
    constructor(configEntity, userService, jwtService, mailerService, verificationService, userBalanceService, redisCacheService, globalConfigService) {
        this.configEntity = configEntity;
        this.userService = userService;
        this.jwtService = jwtService;
        this.mailerService = mailerService;
        this.verificationService = verificationService;
        this.userBalanceService = userBalanceService;
        this.redisCacheService = redisCacheService;
        this.globalConfigService = globalConfigService;
    }
    async onModuleInit() {
        this.getIp();
    }
    async login(user, req) {
        common_1.Logger.debug(`用户登录尝试，用户名: ${user.username}`, 'authService');
        if (user.captchaId) {
            common_1.Logger.debug(`检测到验证码登录，联系方式: ${user.username}`, 'authService');
            return await this.loginWithCaptcha({ contact: user.username, code: user.captchaId }, req);
        }
        const u = await this.userService.verifyUserCredentials(user);
        if (!u) {
            common_1.Logger.error(`登录失败: 用户凭证无效 - 用户名: ${user.username}`, 'authService');
            throw new common_1.HttpException('登录失败，用户凭证无效。', common_1.HttpStatus.UNAUTHORIZED);
        }
        const { username, id, email, role, openId, client, phone } = u;
        common_1.Logger.debug(`用户${username}(ID: ${id})登录成功`, 'authService');
        const ip = (0, utils_1.getClientIp)(req);
        await this.userService.savaLoginIp(id, ip);
        const token = await this.jwtService.sign({
            username,
            id,
            email,
            role,
            openId,
            client,
            phone,
        });
        await this.redisCacheService.saveToken(id, token);
        common_1.Logger.debug(`用户${username}(ID: ${id})登录完成，IP: ${ip}`, 'authService');
        return token;
    }
    async loginWithCaptcha(body, req) {
        const { contact, code } = body;
        let email = '', phone = '';
        const isEmail = /\S+@\S+\.\S+/.test(contact);
        const isPhone = /^\d{10,}$/.test(contact);
        common_1.Logger.debug(`验证码登录 | 联系方式: ${contact}`, 'authService');
        if (isEmail) {
            email = contact;
        }
        else if (isPhone) {
            phone = contact;
        }
        else {
            throw new common_1.HttpException('请提供有效的邮箱地址或手机号码。', common_1.HttpStatus.BAD_REQUEST);
        }
        const nameSpace = await this.globalConfigService.getNamespace();
        const codeKey = `${nameSpace}:CODE:${contact}`;
        const savedCode = await this.redisCacheService.get({ key: codeKey });
        if (savedCode) {
            if (savedCode !== code) {
                common_1.Logger.log(`验证码错误 | 联系方式: ${contact}`, 'authService');
                throw new common_1.HttpException('验证码错误', common_1.HttpStatus.BAD_REQUEST);
            }
            common_1.Logger.debug(`验证码验证成功`);
            await this.redisCacheService.del({ key: codeKey });
            return await this.processUserLogin(email, phone, contact, req);
        }
        else {
            common_1.Logger.log(`验证码不存在或已过期 | 联系方式: ${contact}`, 'authService');
            throw new common_1.HttpException('验证码不存在或已过期，请重新获取', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async processUserLogin(email, phone, contact, req) {
        let u = await this.userService.getUserByContact({ email, phone });
        if (!u) {
            common_1.Logger.log(`创建新用户 | 联系方式: ${contact}`, 'authService');
            let username = (0, utils_1.createRandomUid)();
            while (true) {
                const usernameTaken = await this.userService.verifyUserRegister({
                    username,
                });
                if (usernameTaken) {
                    break;
                }
                username = (0, utils_1.createRandomUid)();
            }
            let newUser = {
                username,
                status: user_constant_1.UserStatusEnum.ACTIVE,
            };
            const isEmail = /\S+@\S+\.\S+/.test(contact);
            if (isEmail) {
                newUser.email = contact;
            }
            else {
                newUser.email = `${(0, utils_1.createRandomUid)()}@aiweb.com`;
                newUser.phone = contact;
            }
            const randomPassword = (0, utils_1.createRandomUid)().substring(0, 8);
            const hashedPassword = bcrypt.hashSync(randomPassword, 10);
            newUser.password = hashedPassword;
            u = await this.userService.createUser(newUser);
            common_1.Logger.log(`用户创建成功 | 用户ID: ${u.id}`, 'authService');
            await this.userBalanceService.addBalanceToNewUser(u.id);
        }
        if (!u) {
            throw new common_1.HttpException('登录失败，用户创建失败。', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        const { username, id, role, openId, client } = u;
        const ip = (0, utils_1.getClientIp)(req);
        await this.userService.savaLoginIp(id, ip);
        const token = await this.jwtService.sign({
            username,
            id,
            email,
            role,
            openId,
            client,
            phone,
        });
        await this.redisCacheService.saveToken(id, token);
        common_1.Logger.log(`用户登录成功 | 用户ID: ${id} | 联系方式: ${contact}`, 'authService');
        return token;
    }
    async loginByOpenId(user, req) {
        const { status } = user;
        if (status !== user_constant_1.UserStatusEnum.ACTIVE) {
            throw new common_1.HttpException(user_constant_1.UserStatusErrMsg[status], common_1.HttpStatus.BAD_REQUEST);
        }
        const { username, id, email, role, openId, client } = user;
        const ip = (0, utils_1.getClientIp)(req);
        await this.userService.savaLoginIp(id, ip);
        const token = await this.jwtService.sign({
            username,
            id,
            email,
            role,
            openId,
            client,
        });
        await this.redisCacheService.saveToken(id, token);
        return token;
    }
    async getInfo(req) {
        const { id, role } = req.user;
        common_1.Logger.debug(`获取用户信息 | 用户ID: ${id} | 角色: ${role}`, 'AuthService-getInfo');
        if (req.headers.fingerprint) {
            common_1.Logger.debug(`请求包含指纹头: ${req.headers.fingerprint}`, 'AuthService-getInfo');
        }
        try {
            const result = await this.userService.getUserInfo(id);
            common_1.Logger.debug(`成功获取用户信息 | 用户ID: ${id}`, 'AuthService-getInfo');
            return result;
        }
        catch (error) {
            common_1.Logger.error(`获取用户信息失败: ${error.message}`, 'AuthService-getInfo');
            throw error;
        }
    }
    async updatePassword(req, body) {
        const { id, client, role } = req.user;
        if (client && Number(client) > 0) {
            throw new common_1.HttpException('无权此操作、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (role === 'admin') {
            throw new common_1.HttpException('非法操作、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
        this.userService.updateUserPassword(id, body.password);
        return '密码修改成功';
    }
    async updatePassByOther(req, body) {
        const { id, client } = req.user;
        if (!client) {
            throw new common_1.HttpException('无权此操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        this.userService.updateUserPassword(id, body.password);
        return '密码修改成功';
    }
    getIp() {
        let ipAddress;
        const interfaces = os.networkInterfaces();
        Object.keys(interfaces).forEach(interfaceName => {
            const interfaceInfo = interfaces[interfaceName];
            for (let i = 0; i < interfaceInfo.length; i++) {
                const alias = interfaceInfo[i];
                if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                    ipAddress = alias.address;
                    break;
                }
            }
        });
        this.ipAddress = ipAddress;
    }
    async sendCode(body) {
        const { contact, isLogin } = body;
        let email = '', phone = '';
        const code = (0, utils_1.createRandomCode)();
        const isEmail = /\S+@\S+\.\S+/.test(contact);
        const isPhone = /^\d{10,}$/.test(contact);
        common_1.Logger.debug(`发送验证码 | 联系方式: ${contact}`);
        if (!isEmail && !isPhone) {
            throw new common_1.HttpException('请提供有效的邮箱地址或手机号码。', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!isLogin) {
            if (isEmail) {
                email = contact;
            }
            else if (isPhone) {
                phone = contact;
            }
        }
        const nameSpace = await this.globalConfigService.getNamespace();
        const key = `${nameSpace}:CODE:${contact}`;
        const ttl = await this.redisCacheService.ttl(key);
        if (ttl && ttl > 0 && isPhone) {
            throw new common_1.HttpException(`${ttl}秒内不得重复发送验证码！`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (isEmail) {
            const existingCode = await this.redisCacheService.get({ key });
            if (existingCode) {
                await this.mailerService.sendMail({
                    to: email,
                    context: {
                        code: existingCode,
                    },
                });
                common_1.Logger.log(`重发验证码 | 邮箱: ${email}`, 'authService');
                return `验证码发送成功、请填写验证码完成${isLogin ? '登录' : '注册'}！`;
            }
            else {
                try {
                    await this.mailerService.sendMail({
                        to: email,
                        context: {
                            code: code,
                        },
                    });
                    common_1.Logger.log(`发送新验证码 | 邮箱: ${email}`, 'authService');
                }
                catch (error) {
                    common_1.Logger.error(`邮件发送失败: ${error.message}`, 'authService');
                    throw new common_1.HttpException('验证码发送失败，请稍后重试', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
                }
                await this.redisCacheService.set({ key, val: code }, 10 * 60);
                return `验证码发送成功、请填写验证码完成${isLogin ? '登录' : '注册'}！`;
            }
        }
        else if (isPhone) {
            const messageInfo = { phone, code };
            await this.verificationService.sendPhoneCode(messageInfo);
            await this.redisCacheService.set({ key, val: code }, 10 * 60);
            common_1.Logger.log(`发送验证码 | 手机号: ${phone}`, 'authService');
            return `验证码发送成功、请填写验证码完成${isLogin ? '登录' : '注册'}！`;
        }
    }
    async sendPhoneCode(body) {
        const { phone, isLogin } = body;
        const code = (0, utils_1.createRandomCode)();
        const isPhone = /^\d{10,}$/.test(phone);
        common_1.Logger.debug(`发送手机验证码 | 手机号: ${phone}`);
        if (!isPhone) {
            throw new common_1.HttpException('请提供有效的手机号码。', common_1.HttpStatus.BAD_REQUEST);
        }
        if (isLogin === false) {
            const isAvailable = await this.userService.verifyUserRegister({
                phone,
            });
            if (!isAvailable) {
                throw new common_1.HttpException('当前手机号已注册，请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const nameSpace = await this.globalConfigService.getNamespace();
        const key = `${nameSpace}:CODE:${phone}`;
        const ttl = await this.redisCacheService.ttl(key);
        if (ttl && ttl > 0 && isPhone) {
            throw new common_1.HttpException(`${ttl}秒内不得重复发送验证码！`, common_1.HttpStatus.BAD_REQUEST);
        }
        const messageInfo = { phone, code };
        await this.redisCacheService.set({ key, val: code }, 10 * 60);
        await this.verificationService.sendPhoneCode(messageInfo);
        common_1.Logger.log(`发送验证码 | 手机号: ${phone}`, 'authService');
        return `验证码发送成功、请填写验证码完成${isLogin === false ? '注册' : '验证/登录'}！`;
    }
    createTokenFromFingerprint(fingerprint) {
        const token = this.jwtService.sign({
            username: `游客${fingerprint}`,
            id: fingerprint,
            email: `${fingerprint}@visitor.com`,
            role: 'visitor',
            openId: null,
            client: null,
        });
        return token;
    }
    async verifyIdentity(req, body) {
        common_1.Logger.debug('开始实名认证流程');
        const { name, idCard } = body;
        const { id } = req.user;
        try {
            const result = await this.verificationService.verifyIdentity(body);
            common_1.Logger.debug(`实名认证结果: ${result}`);
            if (!result) {
                throw new common_1.HttpException('身份验证错误，请检查实名信息', common_1.HttpStatus.BAD_REQUEST);
            }
            await this.userService.saveRealNameInfo(id, name, idCard);
            return '认证成功';
        }
        catch (error) {
            common_1.Logger.error('验证过程出现错误', error);
            throw new common_1.HttpException('认证失败，请检查相关信息', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async verifyPhoneIdentity(req, body) {
        common_1.Logger.debug('开始手机号认证流程');
        const { phone, username, password, code } = body;
        const { id } = req.user;
        const nameSpace = this.globalConfigService.getNamespace();
        const key = `${nameSpace}:CODE:${phone}`;
        const redisCode = await this.redisCacheService.get({ key });
        common_1.Logger.debug(`Retrieved redisCode for ${phone}: ${redisCode}`);
        if (code === '') {
            throw new common_1.HttpException('请输入验证码', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!redisCode) {
            common_1.Logger.log(`验证码过期: ${phone}`, 'authService');
            throw new common_1.HttpException('验证码已过期，请重新发送！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (code !== redisCode) {
            common_1.Logger.log(`验证码错误: ${phone} 输入的验证码: ${code}, 期望的验证码: ${redisCode}`, 'authService');
            throw new common_1.HttpException('验证码填写错误，请重新输入！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (username) {
            const usernameTaken = await this.userService.isUsernameTaken(body.username, id);
            if (usernameTaken) {
                throw new common_1.HttpException('用户名已存在！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        try {
            await this.userService.updateUserPhone(id, phone, username, password);
            return '认证成功';
        }
        catch (error) {
            common_1.Logger.error('验证过程出现错误', error);
            throw new common_1.HttpException('身份验证错误，请检查相关信息', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof user_service_1.UserService !== "undefined" && user_service_1.UserService) === "function" ? _b : Object, typeof (_c = typeof jwt_1.JwtService !== "undefined" && jwt_1.JwtService) === "function" ? _c : Object, typeof (_d = typeof mailer_service_1.MailerService !== "undefined" && mailer_service_1.MailerService) === "function" ? _d : Object, typeof (_e = typeof verification_service_1.VerificationService !== "undefined" && verification_service_1.VerificationService) === "function" ? _e : Object, typeof (_f = typeof userBalance_service_1.UserBalanceService !== "undefined" && userBalance_service_1.UserBalanceService) === "function" ? _f : Object, typeof (_g = typeof redisCache_service_1.RedisCacheService !== "undefined" && redisCache_service_1.RedisCacheService) === "function" ? _g : Object, typeof (_h = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _h : Object])
], AuthService);


/***/ }),
/* 91 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserStatusErrMsg = exports.UserStatusEnum = void 0;
var UserStatusEnum;
(function (UserStatusEnum) {
    UserStatusEnum[UserStatusEnum["PENDING"] = 0] = "PENDING";
    UserStatusEnum[UserStatusEnum["ACTIVE"] = 1] = "ACTIVE";
    UserStatusEnum[UserStatusEnum["LOCKED"] = 2] = "LOCKED";
    UserStatusEnum[UserStatusEnum["BLACKLISTED"] = 3] = "BLACKLISTED";
})(UserStatusEnum || (exports.UserStatusEnum = UserStatusEnum = {}));
exports.UserStatusErrMsg = {
    [UserStatusEnum.PENDING]: '当前账户未激活,请前往邮箱验证或重新发送验证码！',
    [UserStatusEnum.ACTIVE]: '当前账户已激活！',
    [UserStatusEnum.LOCKED]: '当前账户已锁定,请联系管理员解锁！',
    [UserStatusEnum.BLACKLISTED]: '当前账户已被永久封禁！',
};


/***/ }),
/* 92 */
/***/ ((module) => {

module.exports = require("@nestjs/jwt");

/***/ }),
/* 93 */
/***/ ((module) => {

module.exports = require("bcryptjs");

/***/ }),
/* 94 */
/***/ ((module) => {

module.exports = require("os");

/***/ }),
/* 95 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MailerService = void 0;
const common_1 = __webpack_require__(2);
const nodemailer = __webpack_require__(96);
const globalConfig_service_1 = __webpack_require__(74);
let MailerService = class MailerService {
    globalConfigService;
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
                secure: configs.MAILER_SECURE === '1' ? true : false,
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
exports.MailerService = MailerService;
exports.MailerService = MailerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _a : Object])
], MailerService);


/***/ }),
/* 96 */
/***/ ((module) => {

module.exports = require("nodemailer");

/***/ }),
/* 97 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserService = void 0;
const balance_constant_1 = __webpack_require__(35);
const verification_constant_1 = __webpack_require__(98);
const utils_1 = __webpack_require__(36);
const mailer_service_1 = __webpack_require__(95);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const bcrypt = __webpack_require__(93);
const _ = __webpack_require__(99);
const typeorm_2 = __webpack_require__(3);
const config_entity_1 = __webpack_require__(73);
const userBalance_service_1 = __webpack_require__(34);
const user_constant_1 = __webpack_require__(91);
const globalConfig_service_1 = __webpack_require__(74);
const verification_service_1 = __webpack_require__(100);
const user_entity_1 = __webpack_require__(83);
let UserService = class UserService {
    userEntity;
    connection;
    verificationService;
    mailerService;
    userBalanceService;
    globalConfigService;
    configEntity;
    constructor(userEntity, connection, verificationService, mailerService, userBalanceService, globalConfigService, configEntity) {
        this.userEntity = userEntity;
        this.connection = connection;
        this.verificationService = verificationService;
        this.mailerService = mailerService;
        this.userBalanceService = userBalanceService;
        this.globalConfigService = globalConfigService;
        this.configEntity = configEntity;
    }
    async createUserAndVerifycation(user, req) {
        const { username, email, password, client = 0 } = user;
        const where = [{ username }, { email }];
        const u = await this.userEntity.findOne({ where: where });
        if (u && u.status !== user_constant_1.UserStatusEnum.PENDING) {
            throw new common_1.HttpException('用户名或者邮箱已被注册！', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const userInput = _.cloneDeep(user);
            const hashedPassword = bcrypt.hashSync(password, 10);
            const ip = (0, utils_1.getClientIp)(req);
            userInput.password = hashedPassword;
            userInput.registerIp = ip;
            userInput.client = client;
            let n;
            if (!u) {
                const userDefaultAvatar = await this.globalConfigService.getConfigs(['userDefaultAvatar']);
                userInput.avatar = userDefaultAvatar;
                n = await this.userEntity.save(userInput);
            }
            else {
                n = u;
            }
            const emailConfigs = await this.configEntity.find({
                where: {
                    configKey: (0, typeorm_2.In)([
                        'isVerifyEmail',
                        'registerBaseUrl',
                        'registerVerifyEmailTitle',
                        'registerVerifyEmailDesc',
                        'registerVerifyEmailFrom',
                        'registerVerifyExpir',
                    ]),
                },
            });
            const configMap = emailConfigs.reduce((pre, cur) => {
                pre[cur.configKey] = cur.configVal;
                return pre;
            }, {});
            const isVerifyEmail = configMap['isVerifyEmail'] ? Number(configMap['isVerifyEmail']) : 1;
            if (isVerifyEmail) {
                const expir = configMap['registerVerifyExpir']
                    ? Number(configMap['registerVerifyExpir'])
                    : 30 * 60;
                const v = await this.verificationService.createVerification(n, verification_constant_1.VerificationEnum.Registration, expir);
                const { email } = v;
                console.log('configMap: ', configMap);
                console.log(`尝试发送邮件到: ${email}`);
            }
            else {
                const { id } = n;
                await this.updateUserStatus(id, user_constant_1.UserStatusEnum.ACTIVE);
                await this.userBalanceService.addBalanceToNewUser(id);
            }
            return n;
        }
        catch (error) {
            console.log('error: ', error);
            throw error;
        }
    }
    async getSuper() {
        const user = await this.userEntity.findOne({ where: { role: 'super' } });
        return user;
    }
    async verifyUserCredentials(user) {
        const { username, password, uid = 0, phone } = user;
        let u = null;
        if (uid > 0) {
            u = await this.userEntity.findOne({ where: { id: uid } });
            if (!u) {
                throw new common_1.HttpException('当前账户不存在！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (!bcrypt.compareSync(password, u.password)) {
                throw new common_1.HttpException('当前密码错误！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (username && password) {
            const where = [{ username }, { email: username }, { phone: username }];
            u = await this.userEntity.findOne({ where: where });
            if (!u) {
                throw new common_1.HttpException('当前账户不存在！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (!bcrypt.compareSync(password, u.password)) {
                throw new common_1.HttpException('当前密码错误！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (!u) {
            throw new common_1.HttpException('当前账户不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (u.status !== user_constant_1.UserStatusEnum.ACTIVE) {
            throw new common_1.HttpException(user_constant_1.UserStatusErrMsg[u.status], common_1.HttpStatus.BAD_REQUEST);
        }
        return u;
    }
    async verifyUserPassword(userId, password) {
        const u = await this.userEntity.findOne({ where: { id: userId } });
        return bcrypt.compareSync(password, u.password);
    }
    async updateUserStatus(id, status) {
        const u = await this.userEntity.update({ id }, { status });
        return u.affected > 0;
    }
    async getUserStatus(id) {
        const u = await this.userEntity.findOne({ where: { id } });
        return u.status;
    }
    async queryUserInfoById(id) {
        return await this.userEntity.findOne({ where: { id } });
    }
    async queryOneUserInfo(userId) {
        return await this.userEntity.findOne({ where: { id: userId } });
    }
    async checkUserStatus(user) {
        const { id: userId, role } = user;
        if (role === 'visitor')
            return true;
        const u = await this.userEntity.findOne({ where: { id: userId } });
        if (!u) {
            throw new common_1.HttpException('当前用户信息失效、请重新登录！', common_1.HttpStatus.UNAUTHORIZED);
        }
        if (u.status === user_constant_1.UserStatusEnum.BLACKLISTED) {
            throw new common_1.HttpException('您的账户已被永久加入黑名单、如有疑问、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (u.status === user_constant_1.UserStatusEnum.LOCKED) {
            throw new common_1.HttpException('您的账户已被封禁、如有疑问、请联系管理员！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getUserInfo(userId) {
        console.log('getUserInfo', userId.toString());
        const isVisitor = userId > 100000000;
        if (isVisitor) {
            common_1.Logger.debug(`检测到游客用户访问: ${userId}`, 'UserService-getUserInfo');
            const visitorInfo = {
                username: `游客${userId}`,
                avatar: '',
                role: 'visitor',
                email: `${userId}@visitor.com`,
                consecutiveDays: 0,
                phone: null,
                realName: null,
                idCard: null,
                nickname: `游客${userId.toString().slice(-6)}`,
                isBindWx: false,
            };
            const processedId = (userId * 123 + 100000000).toString(36).toUpperCase().slice(-6);
            visitorInfo.id = processedId;
            let userBalance;
            try {
                userBalance = await this.userBalanceService.queryUserBalance(userId);
            }
            catch (error) {
                common_1.Logger.debug(`游客余额查询失败，使用默认值: ${error.message}`, 'UserService-getUserInfo');
                userBalance = {
                    packageId: null,
                    model3Count: 0,
                    model4Count: 0,
                    drawMjCount: 0,
                    memberModel3Count: 0,
                    memberModel4Count: 0,
                    memberDrawMjCount: 0,
                    sumModel3Count: 0,
                    sumModel4Count: 0,
                    sumDrawMjCount: 0,
                };
            }
            return { userInfo: visitorInfo, userBalance: { ...userBalance } };
        }
        const userInfo = await this.userEntity.findOne({
            where: { id: userId },
            select: [
                'username',
                'avatar',
                'role',
                'email',
                'openId',
                'consecutiveDays',
                'phone',
                'realName',
                'idCard',
                'nickname',
            ],
        });
        if (!userInfo) {
            throw new common_1.HttpException('当前用户信息失效、请重新登录！', common_1.HttpStatus.UNAUTHORIZED);
        }
        userInfo.isBindWx = !!userInfo?.openId;
        delete userInfo.openId;
        const userBalance = await this.userBalanceService.queryUserBalance(userId);
        const processedId = (userId * 123 + 100000000).toString(36).toUpperCase().slice(-6);
        userInfo.id = processedId;
        return { userInfo, userBalance: { ...userBalance } };
    }
    async getUserById(id) {
        return await this.userEntity.findOne({ where: { id } });
    }
    async getUserOpenId(openId) {
        return await this.userEntity.findOne({ where: { openId } });
    }
    async updateInfo(body, req) {
        const { id } = req.user;
        const u = await this.userEntity.findOne({ where: { id } });
        if (!u) {
            throw new common_1.HttpException('当前用户不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (body.nickname && u.nickname === body.nickname) {
            throw new common_1.HttpException('没有变更，无需更改！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.userEntity.update({ id }, body);
        if (r.affected <= 0) {
            throw new common_1.HttpException('修改用户信息失败！', common_1.HttpStatus.BAD_REQUEST);
        }
        return '修改用户昵称成功！';
    }
    async isUsernameTaken(username, excludeUserId) {
        const where = { username };
        if (excludeUserId) {
            where.id = (0, typeorm_2.Not)(excludeUserId);
        }
        const user = await this.userEntity.findOne({ where });
        return !!user;
    }
    async updateUserPassword(userId, password) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        const r = await this.userEntity.update({ id: userId }, { password: hashedPassword });
        if (r.affected <= 0) {
            throw new common_1.HttpException('修改密码失败、请重新试试吧。', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async userRecharge(body) {
        const { userId, model3Count = 0, model4Count = 0, drawMjCount = 0 } = body;
        await this.userBalanceService.addBalanceToUser(userId, {
            model3Count,
            model4Count,
            drawMjCount,
        });
        const res = await this.userBalanceService.saveRecordRechargeLog({
            userId,
            rechargeType: balance_constant_1.RechargeType.ADMIN_GIFT,
            model3Count,
            model4Count,
            drawMjCount,
            extent: '',
        });
        return res;
    }
    async queryAll(query, req) {
        const { page = 1, size = 10, username, email, status, keyword, phone, nickname } = query;
        let where = {};
        username && Object.assign(where, { username: (0, typeorm_2.Like)(`%${username}%`) });
        email && Object.assign(where, { email: (0, typeorm_2.Like)(`%${email}%`) });
        phone && Object.assign(where, { phone: (0, typeorm_2.Like)(`%${phone}%`) });
        nickname && Object.assign(where, { nickname: (0, typeorm_2.Like)(`%${nickname}%`) });
        status && Object.assign(where, { status });
        if (keyword) {
            where = [
                { username: (0, typeorm_2.Like)(`%${keyword}%`) },
                { email: (0, typeorm_2.Like)(`%${keyword}%`) },
                { phone: (0, typeorm_2.Like)(`%${keyword}%`) },
                { nickname: (0, typeorm_2.Like)(`%${keyword}%`) },
            ];
        }
        const [rows, count] = await this.userEntity.findAndCount({
            skip: (page - 1) * size,
            where,
            take: size,
            order: { createdAt: 'DESC' },
            cache: true,
            select: [
                'username',
                'avatar',
                'role',
                'sign',
                'status',
                'id',
                'email',
                'createdAt',
                'lastLoginIp',
                'phone',
                'realName',
                'idCard',
                'nickname',
            ],
        });
        const ids = rows.map(t => t.id);
        const data = await this.userBalanceService.queryUserBalanceByIds(ids);
        rows.forEach((user) => (user.balanceInfo = data.find(t => t.userId === user.id)));
        req.user.role !== 'super' && rows.forEach(t => (t.email = (0, utils_1.maskEmail)(t.email)));
        req.user.role !== 'super' && rows.forEach(t => (t.lastLoginIp = (0, utils_1.maskIpAddress)(t.lastLoginIp)));
        req.user.role !== 'super' && rows.forEach(t => (t.phone = (0, utils_1.maskIpAddress)(t.phone)));
        return { rows, count };
    }
    async updateStatus(body) {
        const { id, status } = body;
        const n = await this.userEntity.findOne({ where: { id } });
        if (!n) {
            throw new common_1.HttpException('用户不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (n.role === 'super') {
            throw new common_1.HttpException('超级管理员不可被操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (n.role === 'super') {
            throw new common_1.HttpException('超级管理员不可被操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.userEntity.update({ id }, { status });
        if (r.affected <= 0) {
            throw new common_1.HttpException('修改用户状态失败！', common_1.HttpStatus.BAD_REQUEST);
        }
        return '修改用户状态成功！';
    }
    async resetUserPass(body) {
        const { id } = body;
        const u = await this.userEntity.findOne({ where: { id } });
        if (!u) {
            throw new common_1.HttpException('用户不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const defaultPassword = '123456';
        const hashPassword = bcrypt.hashSync(defaultPassword, 10);
        const raw = await this.userEntity.update({ id }, { password: hashPassword });
        if (raw.affected <= 0) {
            throw new common_1.HttpException('重置密码失败！', common_1.HttpStatus.BAD_REQUEST);
        }
        return `密码重置为[${defaultPassword}]成功!`;
    }
    async savaLoginIp(userId, ip) {
        return await this.userEntity.update({ id: userId }, { lastLoginIp: ip });
    }
    async getUserFromOpenId(openId, sceneStr) {
        const user = await this.userEntity.findOne({ where: { openId } });
        if (!user) {
            const user = await this.createUserFromOpenId(openId);
            await this.userBalanceService.addBalanceToNewUser(user.id);
            return user;
        }
        return user;
    }
    async updateUserInfo(id, userInfo) {
        const user = await this.userEntity.findOne({ where: { id } });
        if (!user) {
            return;
        }
        const { nickname, sex, headimgurl } = userInfo;
        common_1.Logger.log('更新用户信息: ', userInfo);
        return await this.userEntity.update({ id }, { sex: sex, nickname: nickname, avatar: headimgurl });
    }
    async createUserFromOpenId(openId) {
        const userDefaultAvatar = await this.globalConfigService.getConfigs(['userDefaultAvatar']);
        const userInfo = {
            username: `用户${(0, utils_1.createRandomUid)()}`,
            status: user_constant_1.UserStatusEnum.ACTIVE,
            sex: 0,
            email: `${(0, utils_1.createRandomUid)()}@default.com`,
            openId,
        };
        const user = await this.userEntity.save(userInfo);
        return user;
    }
    async createUserFromContact(params) {
        const { username, email, phone } = params;
        const userInfo = {
            username: `用户${(0, utils_1.createRandomUid)()}`,
            status: user_constant_1.UserStatusEnum.ACTIVE,
            sex: 0,
        };
        if (username) {
            userInfo.username = username;
        }
        if (email) {
            userInfo.email = email;
        }
        if (phone) {
            userInfo.phone = phone;
        }
        const user = await this.userEntity.save(userInfo);
        return user;
    }
    async getUserByContact(params) {
        const { username, email, phone } = params;
        const where = [];
        if (username) {
            where.push({ username });
        }
        if (email) {
            where.push({ email });
        }
        if (phone) {
            where.push({ phone });
        }
        return await this.userEntity.findOne({ where });
    }
    async bindWx(openId, userId) {
        try {
            const user = await this.userEntity.findOne({ where: { id: userId } });
            if (!user)
                return { status: false, msg: '当前绑定用户不存在！' };
            const bindU = await this.userEntity.findOne({ where: { openId } });
            if (bindU)
                return { status: false, msg: '该微信已绑定其他账号！' };
            const res = await this.userEntity.update({ id: userId }, { openId });
            if (res.affected <= 0)
                return { status: false, msg: '绑定微信失败、请联系管理员！' };
            return { status: true, msg: '恭喜您绑定成功、后续可直接扫码登录了！' };
        }
        catch (error) {
            return { status: false, msg: '绑定微信失败、请联系管理员！' };
        }
    }
    async updateUserOpenId(userId, openId) {
        try {
            common_1.Logger.log(`执行迁移OpenID操作 - 用户ID: ${userId}, 目标OpenID: ${openId || '(清空)'}`, 'UserService');
            const user = await this.userEntity.findOne({ where: { id: userId } });
            if (!user) {
                common_1.Logger.log(`迁移失败: 用户不存在 - ID: ${userId}`, 'UserService');
                return { status: false, msg: '用户不存在' };
            }
            const oldOpenId = user.openId;
            const res = await this.userEntity.update({ id: userId }, { openId });
            if (res.affected <= 0) {
                common_1.Logger.log(`迁移失败: 数据库更新失败 - ID: ${userId}`, 'UserService');
                return { status: false, msg: '数据库更新失败' };
            }
            common_1.Logger.log(`迁移成功 - 用户ID: ${userId}, 旧OpenID: ${oldOpenId || '(无)'}, 新OpenID: ${openId || '(已清空)'}`, 'UserService');
            return {
                status: true,
                msg: '成功更新用户OpenID',
                oldOpenId,
                newOpenId: openId,
                userId,
            };
        }
        catch (error) {
            common_1.Logger.log(`迁移过程异常: ${error.message}`, 'UserService');
            return { status: false, msg: `更新OpenID时出错: ${error.message}` };
        }
    }
    async getOpenIdByUserId(userId) {
        const user = await this.userEntity.findOne({ where: { id: userId } });
        return user?.openId;
    }
    async verifyUserRegister(params) {
        const { username, phone, email } = params;
        if (phone) {
            const userByPhone = await this.userEntity.findOne({ where: { phone } });
            if (userByPhone) {
                return false;
            }
        }
        if (email) {
            const userByEmail = await this.userEntity.findOne({ where: { email } });
            if (userByEmail) {
                return false;
            }
        }
        if (username) {
            const userByUsername = await this.userEntity.findOne({
                where: { username },
            });
            if (userByUsername) {
                return false;
            }
        }
        if (!phone && !email && !username) {
            return false;
        }
        return true;
    }
    async verifyUserRegisterByPhone(params) {
        const { username, password, phone, phoneCode } = params;
        const user = await this.userEntity.findOne({
            where: [{ username }, { phone }],
        });
        if (user && user.username === username) {
            throw new common_1.HttpException('用户名已存在、请更换用户名！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (user && user.phone === phone) {
            throw new common_1.HttpException('当前手机号已注册、请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async verifyUserRegisterByEmail(params) {
        const { username, email } = params;
        console.log(`校验邮箱注册: 开始 - 用户名: ${username}, 邮箱: ${email}`);
        const user = await this.userEntity.findOne({
            where: [{ username }, { email }],
        });
        if (user && user.username === username) {
            console.error(`校验失败: 用户名 "${username}" 已存在`);
            throw new common_1.HttpException('用户名已存在、请更换用户名！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (user && user.email === email) {
            console.error(`校验失败: 邮箱 "${email}" 已被注册`);
            throw new common_1.HttpException('当前邮箱已注册、请勿重复注册！', common_1.HttpStatus.BAD_REQUEST);
        }
        console.log(`校验邮箱注册: 成功 - 用户名: ${username}, 邮箱: ${email} 未被占用`);
    }
    async createUser(userInfo) {
        return await this.userEntity.save(userInfo);
    }
    async saveRealNameInfo(userId, realName, idCard) {
        const user = await this.userEntity.findOne({ where: { id: userId } });
        if (!user) {
            common_1.Logger.error('用户不存在');
        }
        await this.userEntity.update({ id: userId }, { realName, idCard });
        return;
    }
    async updateUserPhone(userId, phone, username, password) {
        const user = await this.userEntity.findOne({ where: { id: userId } });
        const hashedPassword = bcrypt.hashSync(password, 10);
        if (!user) {
            common_1.Logger.error('用户不存在');
        }
        if (!phone || !username || !hashedPassword) {
            throw new common_1.HttpException('参数错误！', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.userEntity.update({ id: userId }, { phone, username, password: hashedPassword });
        return;
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(6, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Connection !== "undefined" && typeorm_2.Connection) === "function" ? _b : Object, typeof (_c = typeof verification_service_1.VerificationService !== "undefined" && verification_service_1.VerificationService) === "function" ? _c : Object, typeof (_d = typeof mailer_service_1.MailerService !== "undefined" && mailer_service_1.MailerService) === "function" ? _d : Object, typeof (_e = typeof userBalance_service_1.UserBalanceService !== "undefined" && userBalance_service_1.UserBalanceService) === "function" ? _e : Object, typeof (_f = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _f : Object, typeof (_g = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _g : Object])
], UserService);


/***/ }),
/* 98 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VerificationEnum = void 0;
var VerificationEnum;
(function (VerificationEnum) {
    VerificationEnum[VerificationEnum["Registration"] = 0] = "Registration";
    VerificationEnum[VerificationEnum["PasswordReset"] = 1] = "PasswordReset";
    VerificationEnum[VerificationEnum["ChangeEmail"] = 2] = "ChangeEmail";
})(VerificationEnum || (exports.VerificationEnum = VerificationEnum = {}));


/***/ }),
/* 99 */
/***/ ((module) => {

module.exports = require("lodash");

/***/ }),
/* 100 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VerificationService = void 0;
const utils_1 = __webpack_require__(36);
const globalConfig_service_1 = __webpack_require__(74);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const redisCache_service_1 = __webpack_require__(28);
const status_constant_1 = __webpack_require__(77);
const verification_entity_1 = __webpack_require__(101);
const Core = __webpack_require__(102);
const axios_1 = __webpack_require__(39);
let VerificationService = class VerificationService {
    verificationEntity;
    globalConfigService;
    redisCacheService;
    constructor(verificationEntity, globalConfigService, redisCacheService) {
        this.verificationEntity = verificationEntity;
        this.globalConfigService = globalConfigService;
        this.redisCacheService = redisCacheService;
    }
    async createVerification(user, type, expir = 30 * 60) {
        const historyVerify = await this.verificationEntity.findOne({
            where: { userId: user.id, type },
            order: { createdAt: 'DESC' },
        });
        if (historyVerify && historyVerify.createdAt.getTime() + 1 * 60 * 1000 > Date.now()) {
            const diffS = Math.ceil((historyVerify.createdAt.getTime() + 1 * 60 * 1000 - Date.now()) / 1000);
            throw new common_1.HttpException(`${diffS}S内不得重新发送`, common_1.HttpStatus.BAD_REQUEST);
        }
        const code = (0, utils_1.createRandomCode)();
        const expiresAt = new Date(Date.now() + expir * 1000);
        const { id, email } = user;
        const verification = { userId: id, type, code, expiresAt, email };
        return await this.verificationEntity.save(verification);
    }
    async verifyCode({ code, id }, type) {
        const v = await this.verificationEntity.findOne({
            where: { id, type },
            order: { createdAt: 'DESC' },
        });
        if (!v) {
            throw new common_1.HttpException('验证码不存在', common_1.HttpStatus.BAD_REQUEST);
        }
        if (v.used === status_constant_1.VerificationUseStatusEnum.USED) {
            throw new common_1.HttpException('当前验证码已被使用！', common_1.HttpStatus.BAD_REQUEST);
        }
        else {
            v.used = status_constant_1.VerificationUseStatusEnum.USED;
            await this.verificationEntity.update({ id }, v);
        }
        if (Number(v.code) !== Number(code)) {
            throw new common_1.HttpException('验证码错误', common_1.HttpStatus.BAD_REQUEST);
        }
        if (v.expiresAt < new Date()) {
            throw new common_1.HttpException('验证码已过期', common_1.HttpStatus.BAD_REQUEST);
        }
        return v;
    }
    async sendPhoneCode(messageInfo) {
        const { accessKeyId, accessKeySecret, SignName, TemplateCode } = await this.globalConfigService.getPhoneVerifyConfig();
        console.log('Received messageInfo:', messageInfo);
        const { phone, code } = messageInfo;
        if (!phone || !code) {
            throw new common_1.HttpException('确实必要参数错误！', common_1.HttpStatus.BAD_REQUEST);
        }
        const client = new Core({
            accessKeyId,
            accessKeySecret,
            endpoint: 'https://dysmsapi.aliyuncs.com',
            apiVersion: '2017-05-25',
        });
        const params = {
            PhoneNumbers: phone,
            SignName,
            TemplateCode,
            TemplateParam: JSON.stringify({ code }),
        };
        const requestOption = { method: 'POST', formatParams: false };
        try {
            const response = await client.request('SendSms', params, requestOption);
            if (response.Code === 'OK') {
                return true;
            }
            else {
                throw new common_1.HttpException(response.Message || '验证码发送失败！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        catch (error) {
            throw new common_1.HttpException(error?.data?.Message || '验证码发送失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async verifyIdentity(identityInfo) {
        const appCode = await this.globalConfigService.getConfigs(['appCode']);
        const { name, idCard } = identityInfo;
        if (!name || !idCard) {
            throw new common_1.HttpException('缺少必要参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        common_1.Logger.debug(`Received identityInfo: ${name}, ${idCard}`);
        const apiUrl = 'https://eid.shumaidata.com/eid/check';
        const headers = {
            Authorization: `APPCODE ${appCode}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        const params = new URLSearchParams({
            name: name,
            idcard: idCard,
        });
        try {
            const response = await axios_1.default.post(apiUrl, params, { headers });
            const responseString = JSON.stringify(response.data);
            common_1.Logger.debug(`Received response: ${responseString}`);
            switch (response.data.result.res) {
                case '1':
                    return true;
                case '2':
                    common_1.Logger.log('验证不一致', 'VerificationService');
                case '3':
                    common_1.Logger.log('实名认证异常', 'VerificationService');
                default:
                    common_1.Logger.log('未知的认证结果', 'VerificationService');
            }
            return false;
        }
        catch (error) {
            common_1.Logger.error(`Error: ${error.message}`, error.stack, 'Verification');
            return false;
        }
    }
};
exports.VerificationService = VerificationService;
exports.VerificationService = VerificationService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(verification_entity_1.VerificationEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _b : Object, typeof (_c = typeof redisCache_service_1.RedisCacheService !== "undefined" && redisCache_service_1.RedisCacheService) === "function" ? _c : Object])
], VerificationService);


/***/ }),
/* 101 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VerificationEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let VerificationEntity = class VerificationEntity extends baseEntity_1.BaseEntity {
    userId;
    type;
    code;
    expiresAt;
    email;
    used;
};
exports.VerificationEntity = VerificationEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户id' }),
    __metadata("design:type", Number)
], VerificationEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: false, comment: '验证类型' }),
    __metadata("design:type", Number)
], VerificationEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: false, comment: '验证码' }),
    __metadata("design:type", Number)
], VerificationEntity.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '过期时间' }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], VerificationEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: false, comment: '发送的邮箱' }),
    __metadata("design:type", String)
], VerificationEntity.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, nullable: false, comment: '是否已经使用了' }),
    __metadata("design:type", Number)
], VerificationEntity.prototype, "used", void 0);
exports.VerificationEntity = VerificationEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'verification' })
], VerificationEntity);


/***/ }),
/* 102 */
/***/ ((module) => {

module.exports = require("@alicloud/pop-core");

/***/ }),
/* 103 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SuperAuthGuard = void 0;
const common_1 = __webpack_require__(2);
const jwtAuth_guard_1 = __webpack_require__(87);
let SuperAuthGuard = class SuperAuthGuard extends jwtAuth_guard_1.JwtAuthGuard {
    async canActivate(context) {
        const isAuthorized = await super.canActivate(context);
        if (!isAuthorized) {
            return false;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (user && user.role === 'super') {
            return true;
        }
        else {
            throw new common_1.UnauthorizedException('非法操作、非超级管理员无权操作！');
        }
    }
};
exports.SuperAuthGuard = SuperAuthGuard;
exports.SuperAuthGuard = SuperAuthGuard = __decorate([
    (0, common_1.Injectable)()
], SuperAuthGuard);


/***/ }),
/* 104 */
/***/ ((module) => {

module.exports = require("express");

/***/ }),
/* 105 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppService = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const userBalance_service_1 = __webpack_require__(34);
const app_entity_1 = __webpack_require__(106);
const appCats_entity_1 = __webpack_require__(107);
const userApps_entity_1 = __webpack_require__(108);
let AppService = class AppService {
    appCatsEntity;
    appEntity;
    userAppsEntity;
    userBalanceService;
    constructor(appCatsEntity, appEntity, userAppsEntity, userBalanceService) {
        this.appCatsEntity = appCatsEntity;
        this.appEntity = appEntity;
        this.userAppsEntity = userAppsEntity;
        this.userBalanceService = userBalanceService;
    }
    async createAppCat(body) {
        const { name } = body;
        const c = await this.appCatsEntity.findOne({ where: { name } });
        if (c) {
            throw new common_1.HttpException('该分类名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.appCatsEntity.save(body);
    }
    async delAppCat(body) {
        const { id } = body;
        const c = await this.appCatsEntity.findOne({ where: { id } });
        if (!c) {
            throw new common_1.HttpException('该分类不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const apps = await this.appEntity.find();
        const appsWithThisCat = apps.filter(app => {
            const catIds = app.catId.split(',');
            return catIds.includes(id.toString());
        });
        if (appsWithThisCat.length > 0) {
            throw new common_1.HttpException('该分类下存在App，不可删除！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.appCatsEntity.delete(id);
        if (res.affected > 0)
            return '删除成功';
        throw new common_1.HttpException('删除失败！', common_1.HttpStatus.BAD_REQUEST);
    }
    async updateAppCats(body) {
        const { id, name } = body;
        const c = await this.appCatsEntity.findOne({
            where: { name, id: (0, typeorm_2.Not)(id) },
        });
        if (c) {
            throw new common_1.HttpException('该分类名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.appCatsEntity.update({ id }, body);
        if (res.affected > 0)
            return '修改成功';
        throw new common_1.HttpException('修改失败！', common_1.HttpStatus.BAD_REQUEST);
    }
    async queryOneCat(params, req) {
        const { id } = params;
        if (!id) {
            throw new common_1.HttpException('缺失必要参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        const app = await this.appEntity.findOne({ where: { id } });
        if (!app) {
            throw new common_1.HttpException('应用不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const appData = app;
        return {
            demoData: appData.demoData ? appData.demoData.split('\n') : [],
            coverImg: appData.coverImg,
            des: appData.des,
            name: appData.name,
            isGPTs: appData.isGPTs,
            isFlowith: appData.isFlowith,
            flowithId: appData.flowithId,
            flowithName: appData.flowithName,
            isFixedModel: appData.isFixedModel,
            appModel: appData.appModel,
            backgroundImg: appData.backgroundImg,
            prompt: appData.prompt,
        };
    }
    async appCatsList(query, req) {
        const { page = 1, size = 10, name, status } = query;
        const where = {};
        name && (where.name = (0, typeorm_2.Like)(`%${name}%`));
        [0, 1, '0', '1'].includes(status) && (where.status = status);
        const [rows, count] = await this.appCatsEntity.findAndCount({
            where,
            order: { order: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        let filteredRows = [...rows];
        if (req?.user?.role !== 'super') {
            const userCatIds = await this.userBalanceService.getUserApps(Number(req.user.id));
            const userCatIdsSet = new Set(userCatIds);
            filteredRows = rows.filter(cat => {
                if (userCatIdsSet.has(cat.id.toString())) {
                    return true;
                }
                return cat.hideFromNonMember !== 1;
            });
        }
        const catIds = filteredRows.map(item => item.id);
        const apps = await this.appEntity.find();
        const appCountMap = {};
        catIds.forEach(id => {
            appCountMap[id] = 0;
        });
        apps.forEach(item => {
            const appCatIds = item.catId.split(',');
            appCatIds.forEach(catId => {
                const catIdNum = Number(catId);
                if (catIds.includes(catIdNum)) {
                    appCountMap[catIdNum] = (appCountMap[catIdNum] || 0) + 1;
                }
            });
        });
        filteredRows.forEach((item) => (item.appCount = appCountMap[item.id] || 0));
        return { rows: filteredRows, count: filteredRows.length };
    }
    async appList(req, query, orderKey = 'id') {
        const { page = 1, size = 10, name, status, catId, role } = query;
        const where = {};
        name && (where.name = (0, typeorm_2.Like)(`%${name}%`));
        let filteredByCategory = null;
        if (catId) {
            const apps = await this.appEntity.find();
            filteredByCategory = apps
                .filter(app => {
                const appCatIds = app.catId.split(',');
                return appCatIds.includes(catId.toString());
            })
                .map(app => app.id);
            if (filteredByCategory.length === 0) {
                return { rows: [], count: 0 };
            }
            where.id = (0, typeorm_2.In)(filteredByCategory);
        }
        role && (where.role = role);
        status && (where.status = status);
        const [rows, count] = await this.appEntity.findAndCount({
            where,
            order: { [orderKey]: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const allCats = await this.appCatsEntity.find();
        const catsMap = {};
        allCats.forEach(cat => {
            catsMap[cat.id] = cat;
        });
        rows.forEach((item) => {
            const catIds = item.catId.split(',');
            const catNames = catIds
                .map(id => {
                const cat = catsMap[Number(id)];
                return cat ? cat.name : '';
            })
                .filter(name => name);
            item.catName = catNames.join(', ');
            item.backgroundImg = item.backgroundImg;
            item.prompt = item.prompt;
        });
        if (req?.user?.role !== 'super') {
            rows.forEach((item) => {
                delete item.preset;
            });
        }
        return { rows, count };
    }
    async frontAppList(req, query, orderKey = 'id') {
        const { page = 1, size = 1000, catId } = query;
        const where = [
            {
                status: (0, typeorm_2.In)([1, 4]),
                userId: (0, typeorm_2.IsNull)(),
                public: false,
            },
            { userId: (0, typeorm_2.MoreThan)(0), public: true },
        ];
        const userCatIds = await this.userBalanceService.getUserApps(Number(req.user.id));
        const userCatIdsSet = new Set(userCatIds);
        if (catId) {
            const apps = await this.appEntity.find();
            const filteredByCategory = apps
                .filter(app => {
                const appCatIds = app.catId.split(',');
                return appCatIds.includes(catId.toString());
            })
                .map(app => app.id);
            if (filteredByCategory.length === 0) {
                return { rows: [], count: 0 };
            }
            where[0].id = (0, typeorm_2.In)(filteredByCategory);
            where[1].id = (0, typeorm_2.In)(filteredByCategory);
        }
        const [rows, count] = await this.appEntity.findAndCount({
            where,
            order: { order: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const allCats = await this.appCatsEntity.find();
        const catsMap = {};
        allCats.forEach(cat => {
            catsMap[cat.id] = cat;
        });
        let filteredRows = [...rows];
        if (req?.user?.role !== 'super') {
            filteredRows = rows.filter(app => {
                const appCatIds = app.catId.split(',').map(id => Number(id));
                for (const catId of appCatIds) {
                    if (userCatIdsSet.has(catId.toString())) {
                        return true;
                    }
                }
                for (const catId of appCatIds) {
                    const cat = catsMap[catId];
                    if (cat && cat.isMember === 1 && cat.hideFromNonMember === 1) {
                        return false;
                    }
                }
                return true;
            });
        }
        filteredRows.forEach((item) => {
            const appCatIds = item.catId.split(',');
            const catNames = appCatIds
                .map(id => {
                const cat = catsMap[Number(id)];
                return cat ? cat.name : '';
            })
                .filter(name => name);
            item.catName = catNames.join(',');
            item.backgroundImg = item.backgroundImg;
        });
        if (req?.user?.role !== 'super') {
            filteredRows.forEach((item) => {
                delete item.preset;
            });
        }
        return { rows: filteredRows, count: filteredRows.length };
    }
    async searchAppList(body) {
        const { page = 1, size = 1000, keyword, catId, userId, role } = body;
        let baseWhere = [
            {
                status: (0, typeorm_2.In)([1, 4]),
                userId: (0, typeorm_2.IsNull)(),
                public: false,
            },
            { userId: (0, typeorm_2.MoreThan)(0), public: true },
        ];
        if (keyword) {
            baseWhere = baseWhere.map(condition => ({
                ...condition,
                name: (0, typeorm_2.Like)(`%${keyword}%`),
            }));
        }
        if (catId && !isNaN(Number(catId))) {
            const apps = await this.appEntity.find();
            const filteredByCategory = apps
                .filter(app => {
                const appCatIds = app.catId.split(',');
                return appCatIds.includes(catId.toString());
            })
                .map(app => app.id);
            if (filteredByCategory.length === 0) {
                return { rows: [], count: 0 };
            }
            baseWhere = baseWhere.map(condition => ({
                ...condition,
                id: (0, typeorm_2.In)(filteredByCategory),
            }));
        }
        try {
            const userIdNum = isNaN(Number(userId)) ? 0 : Number(userId);
            const userCatIds = await this.userBalanceService.getUserApps(userIdNum);
            const userCatIdsSet = new Set(userCatIds);
            const [rows, count] = await this.appEntity.findAndCount({
                where: baseWhere,
                skip: (page - 1) * size,
                take: size,
            });
            const allCats = await this.appCatsEntity.find();
            const catsMap = {};
            allCats.forEach(cat => {
                catsMap[cat.id] = cat;
            });
            let filteredRows = [...rows];
            if (role !== 'super') {
                filteredRows = rows.filter(app => {
                    const appCatIds = app.catId.split(',').map(id => Number(id));
                    for (const catId of appCatIds) {
                        if (userCatIdsSet.has(catId.toString())) {
                            return true;
                        }
                    }
                    for (const catId of appCatIds) {
                        const cat = catsMap[catId];
                        if (cat && cat.isMember === 1 && cat.hideFromNonMember === 1) {
                            return false;
                        }
                    }
                    return true;
                });
            }
            filteredRows.forEach((item) => {
                const appCatIds = item.catId.split(',');
                const catNames = appCatIds
                    .map(id => {
                    const cat = catsMap[Number(id)];
                    return cat ? cat.name : '';
                })
                    .filter(name => name);
                item.catName = catNames.join(', ');
                item.backgroundImg = item.backgroundImg;
                item.prompt = item.prompt;
                if (role !== 'super') {
                    delete item.preset;
                }
            });
            return { rows: filteredRows, count: filteredRows.length };
        }
        catch (error) {
            throw new common_1.HttpException('查询应用列表失败', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async createApp(body) {
        const { name, catId } = body;
        body.role = 'system';
        const a = await this.appEntity.findOne({ where: { name } });
        if (a) {
            throw new common_1.HttpException('该应用名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!catId) {
            throw new common_1.HttpException('缺少分类ID！', common_1.HttpStatus.BAD_REQUEST);
        }
        const catIds = catId.split(',');
        for (const id of catIds) {
            const numId = Number(id);
            if (isNaN(numId)) {
                throw new common_1.HttpException(`分类ID ${id} 不是有效的数字！`, common_1.HttpStatus.BAD_REQUEST);
            }
            const c = await this.appCatsEntity.findOne({ where: { id: numId } });
            if (!c) {
                throw new common_1.HttpException(`分类ID ${id} 不存在！`, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        try {
            const saveData = { ...body };
            if (!saveData.id || isNaN(Number(saveData.id))) {
                delete saveData.id;
            }
            saveData.public = false;
            saveData.appModel = saveData.appModel || '';
            saveData.order = isNaN(Number(saveData.order)) ? 100 : saveData.order;
            saveData.status = isNaN(Number(saveData.status)) ? 1 : saveData.status;
            saveData.isGPTs = isNaN(Number(saveData.isGPTs)) ? 0 : saveData.isGPTs;
            saveData.isFlowith = isNaN(Number(saveData.isFlowith)) ? 0 : saveData.isFlowith;
            saveData.flowithId = saveData.flowithId || '';
            saveData.flowithName = saveData.flowithName || '';
            saveData.flowithKey = saveData.flowithKey || '';
            saveData.isFixedModel = isNaN(Number(saveData.isFixedModel)) ? 0 : saveData.isFixedModel;
            saveData.backgroundImg = saveData.backgroundImg || '';
            saveData.prompt = saveData.prompt || '';
            return await this.appEntity.save(saveData);
        }
        catch (error) {
            throw new common_1.HttpException(`保存应用失败`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async updateApp(body) {
        const { id, name, catId, status } = body;
        if (id === undefined || id === null || isNaN(Number(id))) {
            throw new common_1.HttpException('无效的应用ID！', common_1.HttpStatus.BAD_REQUEST);
        }
        const a = await this.appEntity.findOne({ where: { name, id: (0, typeorm_2.Not)(id) } });
        if (a) {
            throw new common_1.HttpException('该应用名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const catIds = catId.split(',');
        for (const id of catIds) {
            const c = await this.appCatsEntity.findOne({ where: { id: Number(id) } });
            if (!c) {
                throw new common_1.HttpException(`分类ID ${id} 不存在！`, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const updateData = { ...body };
        const curApp = await this.appEntity.findOne({ where: { id } });
        const curAppData = curApp;
        updateData.appModel = updateData.appModel ?? (curAppData.appModel || '');
        updateData.order = isNaN(Number(updateData.order)) ? 100 : updateData.order;
        updateData.status = isNaN(Number(updateData.status)) ? 1 : updateData.status;
        updateData.isGPTs = isNaN(Number(updateData.isGPTs)) ? 0 : updateData.isGPTs;
        updateData.isFlowith = isNaN(Number(updateData.isFlowith)) ? 0 : updateData.isFlowith;
        updateData.flowithId = updateData.flowithId ?? (curAppData.flowithId || '');
        updateData.flowithName = updateData.flowithName ?? (curAppData.flowithName || '');
        updateData.isFixedModel = isNaN(Number(updateData.isFixedModel)) ? 0 : updateData.isFixedModel;
        updateData.backgroundImg = updateData.backgroundImg ?? (curAppData.backgroundImg || '');
        updateData.prompt = updateData.prompt ?? (curAppData.prompt || '');
        if (curAppData.status !== updateData.status) {
            await this.userAppsEntity.update({ appId: id }, { status: updateData.status });
        }
        const res = await this.appEntity.update({ id }, updateData);
        if (res.affected > 0)
            return '修改App信息成功';
        throw new common_1.HttpException('修改App信息失败！', common_1.HttpStatus.BAD_REQUEST);
    }
    async delApp(body) {
        const { id } = body;
        const a = await this.appEntity.findOne({ where: { id } });
        if (!a) {
            throw new common_1.HttpException('该应用不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.appEntity.delete(id);
        if (res.affected > 0)
            return '删除App成功';
        throw new common_1.HttpException('删除App失败！', common_1.HttpStatus.BAD_REQUEST);
    }
    async collect(body, req) {
        const { appId } = body;
        const { id: userId } = req.user;
        if (appId === undefined || appId === null || isNaN(Number(appId))) {
            throw new common_1.HttpException('无效的应用ID！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (userId === undefined || userId === null || isNaN(Number(userId))) {
            throw new common_1.HttpException('无效的用户ID！', common_1.HttpStatus.BAD_REQUEST);
        }
        const historyApp = await this.userAppsEntity.findOne({
            where: { appId, userId },
        });
        if (historyApp) {
            const r = await this.userAppsEntity.delete({ appId, userId });
            if (r.affected > 0) {
                return '取消收藏成功!';
            }
            else {
                throw new common_1.HttpException('取消收藏失败！', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const app = await this.appEntity.findOne({ where: { id: appId } });
        if (!app) {
            throw new common_1.HttpException('应用不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { id, role: appRole, catId } = app;
        const collectInfo = {
            userId,
            appId: id,
            catId,
            appRole,
            public: true,
            status: 1,
        };
        await this.userAppsEntity.save(collectInfo);
        return '已将应用加入到我的收藏！';
    }
    async mineApps(req, query = { page: 1, size: 30 }) {
        const { id } = req.user;
        const { page = 1, size = 30 } = query;
        let filteredRows = [];
        try {
            const userCatIds = await this.userBalanceService.getUserApps(Number(id));
            const userCatIdsSet = new Set(userCatIds);
            const [rows, count] = await this.userAppsEntity.findAndCount({
                where: { userId: id, status: (0, typeorm_2.In)([1, 3, 4, 5]) },
                order: { id: 'DESC' },
                skip: (page - 1) * size,
                take: size,
            });
            const appIds = rows.map(item => item.appId);
            const appsInfo = await this.appEntity.find({ where: { id: (0, typeorm_2.In)(appIds) } });
            const allCats = await this.appCatsEntity.find();
            const catsMap = {};
            allCats.forEach(cat => {
                catsMap[cat.id] = cat;
            });
            filteredRows = [...rows];
            if (req?.user?.role !== 'super') {
                filteredRows = rows.filter(item => {
                    const app = appsInfo.find(c => c.id === item.appId);
                    if (!app)
                        return false;
                    const appCatIds = app.catId.split(',').map(id => Number(id));
                    for (const catId of appCatIds) {
                        if (userCatIdsSet.has(catId.toString())) {
                            return true;
                        }
                    }
                    for (const catId of appCatIds) {
                        const cat = catsMap[catId];
                        if (cat && cat.isMember === 1 && cat.hideFromNonMember === 1) {
                            return false;
                        }
                    }
                    return true;
                });
            }
            filteredRows.forEach((item) => {
                const app = appsInfo.find(c => c.id === item.appId);
                if (!app)
                    return;
                item.appName = app.name || '';
                item.appRole = app.role || '';
                item.appDes = app.des || '';
                item.coverImg = app.coverImg || '';
                item.demoData = app.demoData || '';
                item.backgroundImg = app.backgroundImg || '';
                const appCatIds = app.catId.split(',');
                const catNames = appCatIds
                    .map(id => {
                    const cat = catsMap[Number(id)];
                    return cat ? cat.name : '';
                })
                    .filter(name => name);
                item.catName = catNames.join(',');
                item.preset = app.userId === id ? app.preset : '******';
                item.prompt = app.prompt || '';
            });
        }
        catch (error) {
            throw new common_1.HttpException('获取用户应用列表失败', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        return { rows: filteredRows, count: filteredRows.length };
    }
    async checkAppIsMemberOnly(appId) {
        try {
            const appInfo = await this.appEntity.findOne({
                where: { id: appId },
                select: ['catId'],
            });
            if (!appInfo || !appInfo.catId) {
                return false;
            }
            const catIds = appInfo.catId
                .split(',')
                .map(id => Number(id.trim()))
                .filter(id => id > 0);
            if (catIds.length === 0) {
                return false;
            }
            const cats = await this.appCatsEntity.find({
                where: { id: (0, typeorm_2.In)(catIds) },
                select: ['id', 'isMember'],
            });
            return cats.some(cat => cat.isMember === 1);
        }
        catch (error) {
            return false;
        }
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(appCats_entity_1.AppCatsEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(app_entity_1.AppEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(userApps_entity_1.UserAppsEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _c : Object, typeof (_d = typeof userBalance_service_1.UserBalanceService !== "undefined" && userBalance_service_1.UserBalanceService) === "function" ? _d : Object])
], AppService);


/***/ }),
/* 106 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let AppEntity = class AppEntity extends baseEntity_1.BaseEntity {
    name;
    catId;
    des;
    preset;
    coverImg;
    order;
    status;
    demoData;
    role;
    isGPTs;
    isFixedModel;
    appModel;
    gizmoID;
    public;
    userId;
    isFlowith;
    flowithId;
    flowithName;
    flowithKey;
    backgroundImg;
    prompt;
};
exports.AppEntity = AppEntity;
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: 'App应用名称' }),
    __metadata("design:type", String)
], AppEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App分类Id列表，多个分类Id以逗号分隔', type: 'text' }),
    __metadata("design:type", String)
], AppEntity.prototype, "catId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用描述信息' }),
    __metadata("design:type", String)
], AppEntity.prototype, "des", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用预设场景信息', type: 'text' }),
    __metadata("design:type", String)
], AppEntity.prototype, "preset", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用封面图片', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], AppEntity.prototype, "coverImg", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用排序、数字越大越靠前', default: 100 }),
    __metadata("design:type", Number)
], AppEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用是否启用中 0：禁用 1：启用', default: 1 }),
    __metadata("design:type", Number)
], AppEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App示例数据', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], AppEntity.prototype, "demoData", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用角色 system  user', default: 'system' }),
    __metadata("design:type", String)
], AppEntity.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用是否是GPTs', default: '0' }),
    __metadata("design:type", Number)
], AppEntity.prototype, "isGPTs", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用是否是固定使用模型', default: '0' }),
    __metadata("design:type", Number)
], AppEntity.prototype, "isFixedModel", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用使用的模型', type: 'text' }),
    __metadata("design:type", String)
], AppEntity.prototype, "appModel", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'GPTs 的调用ID', default: '' }),
    __metadata("design:type", String)
], AppEntity.prototype, "gizmoID", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App是否共享到应用广场', default: false }),
    __metadata("design:type", Boolean)
], AppEntity.prototype, "public", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户Id', nullable: true }),
    __metadata("design:type", Number)
], AppEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否使用flowith模型', default: 0 }),
    __metadata("design:type", Number)
], AppEntity.prototype, "isFlowith", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'flowith模型ID', nullable: true }),
    __metadata("design:type", String)
], AppEntity.prototype, "flowithId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'flowith模型名称', nullable: true }),
    __metadata("design:type", String)
], AppEntity.prototype, "flowithName", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'flowith模型Key', nullable: true }),
    __metadata("design:type", String)
], AppEntity.prototype, "flowithKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App背景图', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], AppEntity.prototype, "backgroundImg", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App提问模版', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], AppEntity.prototype, "prompt", void 0);
exports.AppEntity = AppEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'app' })
], AppEntity);


/***/ }),
/* 107 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppCatsEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let AppCatsEntity = class AppCatsEntity extends baseEntity_1.BaseEntity {
    name;
    order;
    status;
    isMember;
    hideFromNonMember;
};
exports.AppCatsEntity = AppCatsEntity;
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: 'App分类名称' }),
    __metadata("design:type", String)
], AppCatsEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App分类排序、数字越大越靠前', default: 100 }),
    __metadata("design:type", Number)
], AppCatsEntity.prototype, "order", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App分类是否启用中 0：禁用 1：启用', default: 1 }),
    __metadata("design:type", Number)
], AppCatsEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App分类是否为会员专属 0：否 1：是', default: 0 }),
    __metadata("design:type", Number)
], AppCatsEntity.prototype, "isMember", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '非会员是否隐藏 0：否 1：是', default: 0 }),
    __metadata("design:type", Number)
], AppCatsEntity.prototype, "hideFromNonMember", void 0);
exports.AppCatsEntity = AppCatsEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'app_cats' })
], AppCatsEntity);


/***/ }),
/* 108 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserAppsEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let UserAppsEntity = class UserAppsEntity extends baseEntity_1.BaseEntity {
    userId;
    appId;
    appType;
    public;
    status;
    order;
};
exports.UserAppsEntity = UserAppsEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], UserAppsEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '应用ID' }),
    __metadata("design:type", Number)
], UserAppsEntity.prototype, "appId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'app类型 system/user', default: 'user' }),
    __metadata("design:type", String)
], UserAppsEntity.prototype, "appType", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '是否公开到公告菜单', default: false }),
    __metadata("design:type", Boolean)
], UserAppsEntity.prototype, "public", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'app状态 1正常 2审核 3违规', default: 1 }),
    __metadata("design:type", Number)
], UserAppsEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: 'App应用排序、数字越大越靠前', default: 100 }),
    __metadata("design:type", Number)
], UserAppsEntity.prototype, "order", void 0);
exports.UserAppsEntity = UserAppsEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'user_apps' })
], UserAppsEntity);


/***/ }),
/* 109 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CollectAppDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class CollectAppDto {
    appId;
}
exports.CollectAppDto = CollectAppDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要收藏的appId', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: 'ID必须是Number' }),
    __metadata("design:type", Number)
], CollectAppDto.prototype, "appId", void 0);


/***/ }),
/* 110 */
/***/ ((module) => {

module.exports = require("class-validator");

/***/ }),
/* 111 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateAppDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class CreateAppDto {
    name;
    catId;
    des;
    preset;
    gizmoID;
    isGPTs;
    coverImg;
    order;
    status;
    demoData;
    role;
    isFlowith;
    flowithId;
    flowithName;
    flowithKey;
}
exports.CreateAppDto = CreateAppDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '前端助手', description: 'app名称', required: true }),
    (0, class_validator_1.IsDefined)({ message: 'app名称是必传参数' }),
    __metadata("design:type", String)
], CreateAppDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '1,2,3',
        description: 'app分类Id列表，多个分类Id以逗号分隔',
        required: true,
    }),
    (0, class_validator_1.IsDefined)({ message: 'app分类Id必传参数' }),
    __metadata("design:type", String)
], CreateAppDto.prototype, "catId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '适用于编程编码、期望成为您的编程助手',
        description: 'app名称详情描述',
        required: false,
    }),
    (0, class_validator_1.IsDefined)({ message: 'app名称描述是必传参数' }),
    __metadata("design:type", String)
], CreateAppDto.prototype, "des", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '你现在是一个翻译官。接下来我说的所有话帮我翻译成中文',
        description: '预设的prompt',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateAppDto.prototype, "preset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'GPTs 的调用ID',
        description: 'GPTs 使用的 ID',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateAppDto.prototype, "gizmoID", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '是否GPTs', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateAppDto.prototype, "isGPTs", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'https://xxxx.png',
        description: '套餐封面图片',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateAppDto.prototype, "coverImg", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 100,
        description: '套餐排序、数字越大越靠前',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateAppDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: '套餐状态 0：禁用 1：启用',
        required: true,
    }),
    (0, class_validator_1.IsNumber)({}, { message: '套餐状态必须是Number' }),
    (0, class_validator_1.IsIn)([0, 1, 3, 4, 5], { message: '套餐状态错误' }),
    __metadata("design:type", Number)
], CreateAppDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '这是一句示例数据',
        description: 'app示例数据',
        required: false,
    }),
    __metadata("design:type", String)
], CreateAppDto.prototype, "demoData", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'system',
        description: '创建的角色',
        required: false,
    }),
    __metadata("design:type", String)
], CreateAppDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 0,
        description: '是否使用flowith模型',
        required: false,
    }),
    __metadata("design:type", Number)
], CreateAppDto.prototype, "isFlowith", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'flowith模型ID',
        description: 'flowith模型ID',
        required: false,
    }),
    __metadata("design:type", String)
], CreateAppDto.prototype, "flowithId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'flowith模型名称',
        description: 'flowith模型名称',
        required: false,
    }),
    __metadata("design:type", String)
], CreateAppDto.prototype, "flowithName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'flowith模型Key',
        description: 'flowith模型Key',
        required: false,
    }),
    __metadata("design:type", String)
], CreateAppDto.prototype, "flowithKey", void 0);


/***/ }),
/* 112 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateCatsDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class CreateCatsDto {
    name;
    order;
    status;
    isMember;
    hideFromNonMember;
}
exports.CreateCatsDto = CreateCatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '编程助手',
        description: 'app分类名称',
        required: true,
    }),
    (0, class_validator_1.IsDefined)({ message: 'app分类名称是必传参数' }),
    __metadata("design:type", String)
], CreateCatsDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 100,
        description: '分类排序、数字越大越靠前',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateCatsDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: '分类状态 0：禁用 1：启用',
        required: true,
    }),
    (0, class_validator_1.IsNumber)({}, { message: '状态必须是Number' }),
    (0, class_validator_1.IsIn)([0, 1, 3, 4, 5], { message: '套餐状态错误' }),
    __metadata("design:type", Number)
], CreateCatsDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 0,
        description: '分类是否为会员专属 0：否 1：是',
        required: true,
    }),
    (0, class_validator_1.IsNumber)({}, { message: '分类是否为会员专属必须是Number' }),
    (0, class_validator_1.IsIn)([0, 1], { message: '分类是否为会员专属错误' }),
    __metadata("design:type", Number)
], CreateCatsDto.prototype, "isMember", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 0,
        description: '非会员是否隐藏 0：否 1：是',
        required: true,
    }),
    (0, class_validator_1.IsNumber)({}, { message: '非会员是否隐藏必须是Number' }),
    (0, class_validator_1.IsIn)([0, 1], { message: '非会员是否隐藏状态错误' }),
    __metadata("design:type", Number)
], CreateCatsDto.prototype, "hideFromNonMember", void 0);


/***/ }),
/* 113 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OperateAppDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class OperateAppDto {
    id;
}
exports.OperateAppDto = OperateAppDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要删除的appId', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: 'ID必须是Number' }),
    __metadata("design:type", Number)
], OperateAppDto.prototype, "id", void 0);


/***/ }),
/* 114 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DeleteCatsDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class DeleteCatsDto {
    id;
}
exports.DeleteCatsDto = DeleteCatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要删除app分类Id', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: 'ID必须是Number' }),
    __metadata("design:type", Number)
], DeleteCatsDto.prototype, "id", void 0);


/***/ }),
/* 115 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuerAppDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class QuerAppDto {
    page;
    size;
    name;
    status;
    catId;
    role;
    keyword;
}
exports.QuerAppDto = QuerAppDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAppDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAppDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'name', description: 'app名称', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAppDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: 'app状态 0：禁用 1：启用 3:审核加入广场中 4：已拒绝加入广场',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAppDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2, description: 'app分类Id', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAppDto.prototype, "catId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'role', description: 'app角色', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAppDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '关键词',
        description: '搜索关键词',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAppDto.prototype, "keyword", void 0);


/***/ }),
/* 116 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuerCatsDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QuerCatsDto {
    page;
    size;
    name;
    status;
}
exports.QuerCatsDto = QuerCatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerCatsDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerCatsDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'name', description: '分类名称', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerCatsDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: '分类状态 0：禁用 1：启用',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerCatsDto.prototype, "status", void 0);


/***/ }),
/* 117 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateAppDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
const createApp_dto_1 = __webpack_require__(111);
class UpdateAppDto extends createApp_dto_1.CreateAppDto {
    id;
}
exports.UpdateAppDto = UpdateAppDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要修改的分类Id', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: '分类ID必须是Number' }),
    __metadata("design:type", Number)
], UpdateAppDto.prototype, "id", void 0);


/***/ }),
/* 118 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateCatsDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
const createCats_dto_1 = __webpack_require__(112);
class UpdateCatsDto extends createCats_dto_1.CreateCatsDto {
    id;
}
exports.UpdateCatsDto = UpdateCatsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要修改的分类Id', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: '分类ID必须是Number' }),
    __metadata("design:type", Number)
], UpdateCatsDto.prototype, "id", void 0);


/***/ }),
/* 119 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthModule = void 0;
const jwt_strategy_1 = __webpack_require__(120);
const jwtAuth_guard_1 = __webpack_require__(87);
const common_1 = __webpack_require__(2);
const jwt_1 = __webpack_require__(92);
const passport_1 = __webpack_require__(88);
const typeorm_1 = __webpack_require__(33);
const chatGroup_entity_1 = __webpack_require__(82);
const chatLog_entity_1 = __webpack_require__(75);
const cramiPackage_entity_1 = __webpack_require__(71);
const config_entity_1 = __webpack_require__(73);
const mailer_service_1 = __webpack_require__(95);
const redisCache_module_1 = __webpack_require__(26);
const redisCache_service_1 = __webpack_require__(28);
const user_entity_1 = __webpack_require__(83);
const user_module_1 = __webpack_require__(122);
const accountLog_entity_1 = __webpack_require__(79);
const balance_entity_1 = __webpack_require__(80);
const fingerprint_entity_1 = __webpack_require__(84);
const userBalance_entity_1 = __webpack_require__(81);
const userBalance_service_1 = __webpack_require__(34);
const verification_entity_1 = __webpack_require__(101);
const verification_service_1 = __webpack_require__(100);
const auth_controller_1 = __webpack_require__(129);
const auth_service_1 = __webpack_require__(90);
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            user_module_1.UserModule,
            redisCache_module_1.RedisCacheModule,
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                inject: [redisCache_service_1.RedisCacheService],
                useFactory: async (redisService) => ({
                    secret: await redisService.getJwtSecret(),
                    signOptions: { expiresIn: '7d' },
                }),
            }),
            typeorm_1.TypeOrmModule.forFeature([
                verification_entity_1.VerificationEntity,
                balance_entity_1.BalanceEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                userBalance_entity_1.UserBalanceEntity,
                user_entity_1.UserEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                chatLog_entity_1.ChatLogEntity,
                chatGroup_entity_1.ChatGroupEntity,
            ]),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            jwt_strategy_1.JwtStrategy,
            jwtAuth_guard_1.JwtAuthGuard,
            mailer_service_1.MailerService,
            verification_service_1.VerificationService,
            userBalance_service_1.UserBalanceService,
            redisCache_service_1.RedisCacheService,
        ],
        exports: [auth_service_1.AuthService],
    })
], AuthModule);


/***/ }),
/* 120 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JwtStrategy = void 0;
const common_1 = __webpack_require__(2);
const passport_1 = __webpack_require__(88);
const passport_jwt_1 = __webpack_require__(121);
const redisCache_service_1 = __webpack_require__(28);
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy) {
    redisService;
    constructor(redisService) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: redisService.getJwtSecret(),
        });
        this.redisService = redisService;
    }
    async validate(payload) {
        return payload;
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof redisCache_service_1.RedisCacheService !== "undefined" && redisCache_service_1.RedisCacheService) === "function" ? _a : Object])
], JwtStrategy);


/***/ }),
/* 121 */
/***/ ((module) => {

module.exports = require("passport-jwt");

/***/ }),
/* 122 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const app_entity_1 = __webpack_require__(106);
const appCats_entity_1 = __webpack_require__(107);
const chatGroup_entity_1 = __webpack_require__(82);
const chatLog_entity_1 = __webpack_require__(75);
const cramiPackage_entity_1 = __webpack_require__(71);
const config_entity_1 = __webpack_require__(73);
const mailer_service_1 = __webpack_require__(95);
const redisCache_service_1 = __webpack_require__(28);
const accountLog_entity_1 = __webpack_require__(79);
const balance_entity_1 = __webpack_require__(80);
const fingerprint_entity_1 = __webpack_require__(84);
const userBalance_entity_1 = __webpack_require__(81);
const userBalance_service_1 = __webpack_require__(34);
const verification_entity_1 = __webpack_require__(101);
const verification_service_1 = __webpack_require__(100);
const user_controller_1 = __webpack_require__(123);
const user_entity_1 = __webpack_require__(83);
const user_service_1 = __webpack_require__(97);
let UserModule = class UserModule {
};
exports.UserModule = UserModule;
exports.UserModule = UserModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                user_entity_1.UserEntity,
                verification_entity_1.VerificationEntity,
                balance_entity_1.BalanceEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                userBalance_entity_1.UserBalanceEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                chatLog_entity_1.ChatLogEntity,
                chatGroup_entity_1.ChatGroupEntity,
                app_entity_1.AppEntity,
                appCats_entity_1.AppCatsEntity,
            ]),
        ],
        controllers: [user_controller_1.UserController],
        providers: [
            user_service_1.UserService,
            verification_service_1.VerificationService,
            userBalance_service_1.UserBalanceService,
            redisCache_service_1.RedisCacheService,
            mailer_service_1.MailerService,
        ],
        exports: [user_service_1.UserService],
    })
], UserModule);


/***/ }),
/* 123 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const jwtAuth_guard_1 = __webpack_require__(87);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const queryAllUser_dto_1 = __webpack_require__(124);
const resetUserPass_dto_1 = __webpack_require__(125);
const updateUser_dto_1 = __webpack_require__(126);
const updateUserStatus_dto_1 = __webpack_require__(127);
const userRecharge_dto_1 = __webpack_require__(128);
const user_service_1 = __webpack_require__(97);
let UserController = class UserController {
    userService;
    constructor(userService) {
        this.userService = userService;
    }
    async update(body, req) {
        return await this.userService.updateInfo(body, req);
    }
    async userRecharge(body) {
        return await this.userService.userRecharge(body);
    }
    async queryAll(query, req) {
        return await this.userService.queryAll(query, req);
    }
    async updateStatus(body) {
        return await this.userService.updateStatus(body);
    }
    async resetUserPass(body) {
        return await this.userService.resetUserPass(body);
    }
};
exports.UserController = UserController;
__decorate([
    (0, common_1.Post)('update'),
    (0, swagger_1.ApiOperation)({ summary: '更新用户信息' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof updateUser_dto_1.UpdateUserDto !== "undefined" && updateUser_dto_1.UpdateUserDto) === "function" ? _b : Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('recharge'),
    (0, swagger_1.ApiOperation)({ summary: '用户充值' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof userRecharge_dto_1.UserRechargeDto !== "undefined" && userRecharge_dto_1.UserRechargeDto) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "userRecharge", null);
__decorate([
    (0, common_1.Get)('queryAll'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有用户' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof queryAllUser_dto_1.QueryAllUserDto !== "undefined" && queryAllUser_dto_1.QueryAllUserDto) === "function" ? _e : Object, typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "queryAll", null);
__decorate([
    (0, common_1.Post)('updateStatus'),
    (0, swagger_1.ApiOperation)({ summary: '更新用户状态' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof updateUserStatus_dto_1.UpdateUserStatusDto !== "undefined" && updateUserStatus_dto_1.UpdateUserStatusDto) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Post)('resetUserPass'),
    (0, swagger_1.ApiOperation)({ summary: '重置用户密码' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_h = typeof resetUserPass_dto_1.ResetUserPassDto !== "undefined" && resetUserPass_dto_1.ResetUserPassDto) === "function" ? _h : Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "resetUserPass", null);
exports.UserController = UserController = __decorate([
    (0, common_1.Controller)('user'),
    (0, swagger_1.ApiTags)('user'),
    __metadata("design:paramtypes", [typeof (_a = typeof user_service_1.UserService !== "undefined" && user_service_1.UserService) === "function" ? _a : Object])
], UserController);


/***/ }),
/* 124 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryAllUserDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class QueryAllUserDto {
    page;
    size;
    username;
    email;
    phone;
    status;
    keyword;
    nickname;
}
exports.QueryAllUserDto = QueryAllUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryAllUserDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryAllUserDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '99AI', description: '用户姓名', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryAllUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'aiweb@aiweb.com',
        description: '用户邮箱',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryAllUserDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '18888888888',
        description: '用户手机号码',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryAllUserDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2, description: '用户状态', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryAllUserDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'super', description: '关键字查询', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryAllUserDto.prototype, "keyword", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '用户昵称', description: '用户昵称', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryAllUserDto.prototype, "nickname", void 0);


/***/ }),
/* 125 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ResetUserPassDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class ResetUserPassDto {
    id;
}
exports.ResetUserPassDto = ResetUserPassDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        nullable: true,
        description: '用户id',
        required: false,
    }),
    (0, class_validator_1.IsDefined)({ message: '用户id是必传参数' }),
    __metadata("design:type", Number)
], ResetUserPassDto.prototype, "id", void 0);


/***/ }),
/* 126 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateUserDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class UpdateUserDto {
    nickname;
    avatar;
}
exports.UpdateUserDto = UpdateUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'cooper',
        nullable: true,
        description: '用户名称',
        required: false,
    }),
    (0, class_validator_1.MinLength)(2, { message: '用户名最低需要大于2位数！' }),
    (0, class_validator_1.MaxLength)(12, { message: '用户名不得超过12位！' }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户名不能为空！' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "nickname", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '', description: '用户头像', required: false }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户头像不能为空！' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "avatar", void 0);


/***/ }),
/* 127 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateUserStatusDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class UpdateUserStatusDto {
    status;
    id;
}
exports.UpdateUserStatusDto = UpdateUserStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 2, description: '用户状态', required: false }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户状态不能为空！' }),
    (0, class_validator_1.IsDefined)({ message: '用户状态是必传参数' }),
    (0, class_validator_1.IsIn)([0, 1, 2, 3], { message: '非法参数、用户状态非法！' }),
    __metadata("design:type", Number)
], UpdateUserStatusDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '修改的用户id', required: false }),
    (0, class_validator_1.IsDefined)({ message: '用户id是必传参数' }),
    __metadata("design:type", Number)
], UpdateUserStatusDto.prototype, "id", void 0);


/***/ }),
/* 128 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserRechargeDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class UserRechargeDto {
    userId;
    model3Count;
    model4Count;
    drawMjCount;
}
exports.UserRechargeDto = UserRechargeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '用户id', required: true }),
    (0, class_validator_1.IsDefined)({ message: '用户id是必传参数' }),
    __metadata("design:type", Number)
], UserRechargeDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 100,
        description: '用户对话模型3次数',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UserRechargeDto.prototype, "model3Count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 5,
        description: '用户对话模型4次数',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UserRechargeDto.prototype, "model4Count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: '用户MJ额度', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UserRechargeDto.prototype, "drawMjCount", void 0);


/***/ }),
/* 129 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthController = void 0;
const jwtAuth_guard_1 = __webpack_require__(87);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const auth_service_1 = __webpack_require__(90);
const authLogin_dto_1 = __webpack_require__(130);
const updatePassByOther_dto_1 = __webpack_require__(131);
const updatePassword_dto_1 = __webpack_require__(132);
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async login(body, req) {
        return this.authService.login(body, req);
    }
    async updatePassword(req, body) {
        return this.authService.updatePassword(req, body);
    }
    async updatePassByOther(req, body) {
        return this.authService.updatePassByOther(req, body);
    }
    async getInfo(req) {
        const { id, role } = req.user || {};
        const fingerprint = req.headers.fingerprint;
        common_1.Logger.debug(`用户信息请求 | ID: ${id} | 角色: ${role} | 指纹: ${fingerprint}`, 'AuthController');
        return this.authService.getInfo(req);
    }
    async sendCode(parmas) {
        return this.authService.sendCode(parmas);
    }
    async sendPhoneCode(parmas) {
        return this.authService.sendPhoneCode(parmas);
    }
    async verifyIdentity(req, body) {
        return this.authService.verifyIdentity(req, body);
    }
    async verifyPhoneIdentity(req, body) {
        return this.authService.verifyPhoneIdentity(req, body);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    (0, swagger_1.ApiOperation)({ summary: '用户登录' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof authLogin_dto_1.UserLoginDto !== "undefined" && authLogin_dto_1.UserLoginDto) === "function" ? _b : Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('updatePassword'),
    (0, swagger_1.ApiOperation)({ summary: '用户更改密码' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object, typeof (_e = typeof updatePassword_dto_1.UpdatePasswordDto !== "undefined" && updatePassword_dto_1.UpdatePasswordDto) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "updatePassword", null);
__decorate([
    (0, common_1.Post)('updatePassByOther'),
    (0, swagger_1.ApiOperation)({ summary: '管理员更改用户密码' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object, typeof (_g = typeof updatePassByOther_dto_1.UpdatePassByOtherDto !== "undefined" && updatePassByOther_dto_1.UpdatePassByOtherDto) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "updatePassByOther", null);
__decorate([
    (0, common_1.Get)('getInfo'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户个人信息' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_h = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _h : Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getInfo", null);
__decorate([
    (0, common_1.Post)('sendCode'),
    (0, swagger_1.ApiOperation)({ summary: '发送验证码' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "sendCode", null);
__decorate([
    (0, common_1.Post)('sendPhoneCode'),
    (0, swagger_1.ApiOperation)({ summary: '发送手机验证码' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "sendPhoneCode", null);
__decorate([
    (0, common_1.Post)('verifyIdentity'),
    (0, swagger_1.ApiOperation)({ summary: '验证身份' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_j = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _j : Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyIdentity", null);
__decorate([
    (0, common_1.Post)('verifyPhoneIdentity'),
    (0, swagger_1.ApiOperation)({ summary: '验证手机号' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_k = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _k : Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyPhoneIdentity", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [typeof (_a = typeof auth_service_1.AuthService !== "undefined" && auth_service_1.AuthService) === "function" ? _a : Object])
], AuthController);


/***/ }),
/* 130 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserLoginDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class UserLoginDto {
    username;
    uid;
    password;
    captchaId;
}
exports.UserLoginDto = UserLoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'super', description: '邮箱' }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户名不能为空！' }),
    (0, class_validator_1.MinLength)(2, { message: '用户名最短是两位数！' }),
    (0, class_validator_1.MaxLength)(30, { message: '用户名最长不得超过30位！' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UserLoginDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '用户ID' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UserLoginDto.prototype, "uid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '999999', description: '密码' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MinLength)(6, { message: '用户密码最低需要大于6位数！' }),
    (0, class_validator_1.MaxLength)(30, { message: '用户密码最长不能超过30位数！' }),
    __metadata("design:type", String)
], UserLoginDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'abc123', description: '图形验证码ID' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UserLoginDto.prototype, "captchaId", void 0);


/***/ }),
/* 131 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdatePassByOtherDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class UpdatePassByOtherDto {
    password;
}
exports.UpdatePassByOtherDto = UpdatePassByOtherDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '666666', description: '三方用户更新新密码' }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户密码不能为空！' }),
    (0, class_validator_1.MinLength)(6, { message: '用户密码最低需要大于6位数！' }),
    (0, class_validator_1.MaxLength)(30, { message: '用户密码最长不能超过30位数！' }),
    __metadata("design:type", String)
], UpdatePassByOtherDto.prototype, "password", void 0);


/***/ }),
/* 132 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdatePasswordDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class UpdatePasswordDto {
    password;
}
exports.UpdatePasswordDto = UpdatePasswordDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '666666', description: '用户更新新密码' }),
    (0, class_validator_1.IsNotEmpty)({ message: '用户密码不能为空！' }),
    (0, class_validator_1.MinLength)(6, { message: '用户密码最低需要大于6位数！' }),
    (0, class_validator_1.MaxLength)(30, { message: '用户密码最长不能超过30位数！' }),
    __metadata("design:type", String)
], UpdatePasswordDto.prototype, "password", void 0);


/***/ }),
/* 133 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AutoReplyModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const autoReply_controller_1 = __webpack_require__(134);
const autoReply_entity_1 = __webpack_require__(136);
const autoReply_service_1 = __webpack_require__(135);
let AutoReplyModule = class AutoReplyModule {
};
exports.AutoReplyModule = AutoReplyModule;
exports.AutoReplyModule = AutoReplyModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([autoReply_entity_1.AutoReplyEntity])],
        controllers: [autoReply_controller_1.AutoReplyController],
        providers: [autoReply_service_1.AutoReplyService],
        exports: [autoReply_service_1.AutoReplyService],
    })
], AutoReplyModule);


/***/ }),
/* 134 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AutoReplyController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const autoReply_service_1 = __webpack_require__(135);
const addAutoReply_dto_1 = __webpack_require__(137);
const delBadWords_dto_1 = __webpack_require__(138);
const queryAutoReply_dto_1 = __webpack_require__(139);
const updateAutoReply_dto_1 = __webpack_require__(140);
let AutoReplyController = class AutoReplyController {
    autoReplyService;
    constructor(autoReplyService) {
        this.autoReplyService = autoReplyService;
    }
    queryAutoReply(query) {
        return this.autoReplyService.queryAutoReply(query);
    }
    addAutoReply(body) {
        return this.autoReplyService.addAutoReply(body);
    }
    updateAutoReply(body) {
        return this.autoReplyService.updateAutoReply(body);
    }
    delAutoReply(body) {
        return this.autoReplyService.delAutoReply(body);
    }
};
exports.AutoReplyController = AutoReplyController;
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '查询自动回复' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof queryAutoReply_dto_1.QueryAutoReplyDto !== "undefined" && queryAutoReply_dto_1.QueryAutoReplyDto) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], AutoReplyController.prototype, "queryAutoReply", null);
__decorate([
    (0, common_1.Post)('add'),
    (0, swagger_1.ApiOperation)({ summary: '添加自动回复' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof addAutoReply_dto_1.AddAutoReplyDto !== "undefined" && addAutoReply_dto_1.AddAutoReplyDto) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], AutoReplyController.prototype, "addAutoReply", null);
__decorate([
    (0, common_1.Post)('update'),
    (0, swagger_1.ApiOperation)({ summary: '修改自动回复' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof updateAutoReply_dto_1.UpdateAutoReplyDto !== "undefined" && updateAutoReply_dto_1.UpdateAutoReplyDto) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], AutoReplyController.prototype, "updateAutoReply", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除自动回复' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof delBadWords_dto_1.DelAutoReplyDto !== "undefined" && delBadWords_dto_1.DelAutoReplyDto) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], AutoReplyController.prototype, "delAutoReply", null);
exports.AutoReplyController = AutoReplyController = __decorate([
    (0, swagger_1.ApiTags)('autoReply'),
    (0, common_1.Controller)('autoReply'),
    __metadata("design:paramtypes", [typeof (_a = typeof autoReply_service_1.AutoReplyService !== "undefined" && autoReply_service_1.AutoReplyService) === "function" ? _a : Object])
], AutoReplyController);


/***/ }),
/* 135 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AutoReplyService = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const autoReply_entity_1 = __webpack_require__(136);
let AutoReplyService = class AutoReplyService {
    autoReplyEntity;
    autoReplyKes = [];
    autoReplyMap = {};
    autoReplyFuzzyMatch = true;
    constructor(autoReplyEntity) {
        this.autoReplyEntity = autoReplyEntity;
    }
    async onModuleInit() {
        await this.loadAutoReplyList();
    }
    async loadAutoReplyList() {
        const res = await this.autoReplyEntity.find({
            where: { status: 1 },
            select: ['prompt', 'answer', 'isAIReplyEnabled'],
        });
        this.autoReplyMap = {};
        this.autoReplyKes = [];
        res.forEach(t => {
            this.autoReplyMap[t.prompt] = {
                answer: t.answer,
                isAIReplyEnabled: t.isAIReplyEnabled,
            };
            const keywords = t.prompt.split(' ').map(k => k.trim());
            this.autoReplyKes.push({ prompt: t.prompt, keywords });
        });
    }
    async checkAutoReply(prompt) {
        const answers = [];
        let isAIReplyEnabled = 0;
        const seenGroups = new Set();
        if (this.autoReplyFuzzyMatch) {
            for (const item of this.autoReplyKes) {
                if (item.keywords.some(keyword => prompt.includes(keyword))) {
                    if (!seenGroups.has(item.prompt)) {
                        answers.push(this.autoReplyMap[item.prompt].answer);
                        seenGroups.add(item.prompt);
                        if (this.autoReplyMap[item.prompt].isAIReplyEnabled === 1) {
                            isAIReplyEnabled = 1;
                        }
                    }
                }
            }
        }
        else {
            const matches = this.autoReplyKes.filter(item => item.prompt === prompt);
            for (const match of matches) {
                if (!seenGroups.has(match.prompt)) {
                    answers.push(this.autoReplyMap[match.prompt].answer);
                    seenGroups.add(match.prompt);
                    if (this.autoReplyMap[match.prompt].isAIReplyEnabled === 1) {
                        isAIReplyEnabled = 1;
                    }
                }
            }
        }
        return {
            answer: answers.join('\n'),
            isAIReplyEnabled,
        };
    }
    async queryAutoReply(query) {
        const { page = 1, size = 10, prompt, status } = query;
        const where = {};
        [0, 1, '0', '1'].includes(status) && (where.status = status);
        prompt && (where.prompt = (0, typeorm_2.Like)(`%${prompt}%`));
        const [rows, count] = await this.autoReplyEntity.findAndCount({
            where,
            skip: (page - 1) * size,
            take: size,
            order: { id: 'DESC' },
        });
        return { rows, count };
    }
    async addAutoReply(body) {
        await this.autoReplyEntity.save(body);
        await this.loadAutoReplyList();
        return '添加问题成功！';
    }
    async updateAutoReply(body) {
        const { id } = body;
        const res = await this.autoReplyEntity.update({ id }, body);
        if (res.affected > 0) {
            await this.loadAutoReplyList();
            return '更新问题成功';
        }
        throw new common_1.HttpException('更新失败', common_1.HttpStatus.BAD_REQUEST);
    }
    async delAutoReply(body) {
        const { id } = body;
        const z = await this.autoReplyEntity.findOne({ where: { id } });
        if (!z) {
            throw new common_1.HttpException('该问题不存在,请检查您的提交信息', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.autoReplyEntity.delete({ id });
        if (res.affected > 0) {
            await this.loadAutoReplyList();
            return '删除问题成功';
        }
        throw new common_1.HttpException('删除失败', common_1.HttpStatus.BAD_REQUEST);
    }
};
exports.AutoReplyService = AutoReplyService;
exports.AutoReplyService = AutoReplyService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(autoReply_entity_1.AutoReplyEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object])
], AutoReplyService);


/***/ }),
/* 136 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AutoReplyEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let AutoReplyEntity = class AutoReplyEntity extends baseEntity_1.BaseEntity {
    prompt;
    answer;
    isAIReplyEnabled;
    status;
};
exports.AutoReplyEntity = AutoReplyEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '提问的问题', type: 'text' }),
    __metadata("design:type", String)
], AutoReplyEntity.prototype, "prompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '定义的答案', type: 'text' }),
    __metadata("design:type", String)
], AutoReplyEntity.prototype, "answer", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '是否开启AI回复，0：关闭 1：启用' }),
    __metadata("design:type", Number)
], AutoReplyEntity.prototype, "isAIReplyEnabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '启用当前自动回复状态， 0：关闭 1：启用' }),
    __metadata("design:type", Number)
], AutoReplyEntity.prototype, "status", void 0);
exports.AutoReplyEntity = AutoReplyEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'auto_reply' })
], AutoReplyEntity);


/***/ }),
/* 137 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AddAutoReplyDto = void 0;
const swagger_1 = __webpack_require__(14);
class AddAutoReplyDto {
    prompt;
    answer;
}
exports.AddAutoReplyDto = AddAutoReplyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '你是谁', description: '提问的问题', required: true }),
    __metadata("design:type", String)
], AddAutoReplyDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '我是AIWeb提供的Ai服务机器人',
        description: '回答的答案',
        required: true,
    }),
    __metadata("design:type", String)
], AddAutoReplyDto.prototype, "answer", void 0);


/***/ }),
/* 138 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DelAutoReplyDto = void 0;
const swagger_1 = __webpack_require__(14);
class DelAutoReplyDto {
    id;
}
exports.DelAutoReplyDto = DelAutoReplyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '自动回复id', required: true }),
    __metadata("design:type", Number)
], DelAutoReplyDto.prototype, "id", void 0);


/***/ }),
/* 139 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryAutoReplyDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QueryAutoReplyDto {
    page;
    size;
    prompt;
    status;
}
exports.QueryAutoReplyDto = QueryAutoReplyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryAutoReplyDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryAutoReplyDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '你是谁', description: '提问问题', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryAutoReplyDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '问题状态', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryAutoReplyDto.prototype, "status", void 0);


/***/ }),
/* 140 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateAutoReplyDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class UpdateAutoReplyDto {
    id;
    prompt;
    answer;
    status;
}
exports.UpdateAutoReplyDto = UpdateAutoReplyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '自动回复id', required: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateAutoReplyDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '你可以干嘛', description: '问题', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateAutoReplyDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '我可以干很多事情.......',
        description: '答案',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateAutoReplyDto.prototype, "answer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: '状态', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateAutoReplyDto.prototype, "status", void 0);


/***/ }),
/* 141 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BadWordsModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const user_entity_1 = __webpack_require__(83);
const badWords_controller_1 = __webpack_require__(142);
const badWords_entity_1 = __webpack_require__(144);
const badWords_service_1 = __webpack_require__(143);
const violationLog_entity_1 = __webpack_require__(145);
let BadWordsModule = class BadWordsModule {
};
exports.BadWordsModule = BadWordsModule;
exports.BadWordsModule = BadWordsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([badWords_entity_1.BadWordsEntity, violationLog_entity_1.ViolationLogEntity, user_entity_1.UserEntity])],
        providers: [badWords_service_1.BadWordsService],
        controllers: [badWords_controller_1.BadWordsController],
        exports: [badWords_service_1.BadWordsService],
    })
], BadWordsModule);


/***/ }),
/* 142 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BadWordsController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const badWords_service_1 = __webpack_require__(143);
const addBadWords_dto_1 = __webpack_require__(146);
const delBadWords_dto_1 = __webpack_require__(147);
const queryBadWords_dto_1 = __webpack_require__(148);
const queryViolation_dto_1 = __webpack_require__(149);
const updateBadWords_dto_1 = __webpack_require__(150);
let BadWordsController = class BadWordsController {
    badWordsService;
    constructor(badWordsService) {
        this.badWordsService = badWordsService;
    }
    queryBadWords(query) {
        return this.badWordsService.queryBadWords(query);
    }
    delBadWords(body) {
        return this.badWordsService.delBadWords(body);
    }
    updateBadWords(body) {
        return this.badWordsService.updateBadWords(body);
    }
    addBadWord(body) {
        return this.badWordsService.addBadWord(body);
    }
    violation(req, query) {
        return this.badWordsService.violation(req, query);
    }
};
exports.BadWordsController = BadWordsController;
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有敏感词' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof queryBadWords_dto_1.QueryBadWordsDto !== "undefined" && queryBadWords_dto_1.QueryBadWordsDto) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "queryBadWords", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除敏感词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof delBadWords_dto_1.DelBadWordsDto !== "undefined" && delBadWords_dto_1.DelBadWordsDto) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "delBadWords", null);
__decorate([
    (0, common_1.Post)('update'),
    (0, swagger_1.ApiOperation)({ summary: '更新敏感词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof updateBadWords_dto_1.UpdateBadWordsDto !== "undefined" && updateBadWords_dto_1.UpdateBadWordsDto) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "updateBadWords", null);
__decorate([
    (0, common_1.Post)('add'),
    (0, swagger_1.ApiOperation)({ summary: '新增敏感词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof addBadWords_dto_1.AddBadWordDto !== "undefined" && addBadWords_dto_1.AddBadWordDto) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "addBadWord", null);
__decorate([
    (0, common_1.Get)('violation'),
    (0, swagger_1.ApiOperation)({ summary: '查询违规记录' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object, typeof (_g = typeof queryViolation_dto_1.QueryViolationDto !== "undefined" && queryViolation_dto_1.QueryViolationDto) === "function" ? _g : Object]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "violation", null);
exports.BadWordsController = BadWordsController = __decorate([
    (0, swagger_1.ApiTags)('badWords'),
    (0, common_1.Controller)('badWords'),
    __metadata("design:paramtypes", [typeof (_a = typeof badWords_service_1.BadWordsService !== "undefined" && badWords_service_1.BadWordsService) === "function" ? _a : Object])
], BadWordsController);


/***/ }),
/* 143 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BadWordsService = void 0;
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const axios_1 = __webpack_require__(39);
const typeorm_2 = __webpack_require__(3);
const globalConfig_service_1 = __webpack_require__(74);
const user_entity_1 = __webpack_require__(83);
const badWords_entity_1 = __webpack_require__(144);
const violationLog_entity_1 = __webpack_require__(145);
let BadWordsService = class BadWordsService {
    badWordsEntity;
    violationLogEntity;
    userEntity;
    globalConfigService;
    badWords;
    constructor(badWordsEntity, violationLogEntity, userEntity, globalConfigService) {
        this.badWordsEntity = badWordsEntity;
        this.violationLogEntity = violationLogEntity;
        this.userEntity = userEntity;
        this.globalConfigService = globalConfigService;
        this.badWords = [];
    }
    async onModuleInit() {
        this.loadBadWords();
    }
    async customSensitiveWords(content, userId) {
        const triggeredWords = [];
        for (let i = 0; i < this.badWords.length; i++) {
            const word = this.badWords[i];
            if (content.includes(word)) {
                triggeredWords.push(word);
            }
        }
        if (triggeredWords.length) {
            await this.recordUserBadWords(userId, content, triggeredWords, ['自定义'], '自定义检测');
        }
        return triggeredWords;
    }
    async checkBadWords(content, userId) {
        const config = await this.globalConfigService.getSensitiveConfig();
        if (config) {
            await this.checkBadWordsByConfig(content, config, userId);
        }
        return await this.customSensitiveWords(content, userId);
    }
    async checkBadWordsByConfig(content, config, userId) {
        const { useType } = config;
        useType === 'baidu' &&
            (await this.baiduCheckBadWords(content, config.baiduTextAccessToken, userId));
    }
    extractContent(str) {
        const pattern = /存在(.*?)不合规/;
        const match = str.match(pattern);
        return match ? match[1] : '';
    }
    async baiduCheckBadWords(content, accessToken, userId) {
        if (!accessToken)
            return;
        if (!content || content.trim() === '') {
            common_1.Logger.debug('提交的内容为空，跳过百度敏感词检测', 'BadWordsService');
            return;
        }
        const url = `https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined?access_token=${accessToken}}`;
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        };
        try {
            const response = await axios_1.default.post(url, { text: content }, { headers });
            const { conclusion, error_code, error_msg, conclusionType, data } = response.data;
            if (error_code) {
                common_1.Logger.warn(`百度文本检测出现错误、请查看配置信息: ${error_msg}`, 'BadWordsService');
                return;
            }
            if (conclusionType !== 1 && data && Array.isArray(data)) {
                const types = [...new Set(data.map(item => this.extractContent(item.msg)))];
                await this.recordUserBadWords(userId, content, ['***'], types, '百度云检测');
                const tips = `您提交的信息中包含${types.join(',')}的内容、我们已对您的账户进行标记、请合规使用！`;
                throw new common_1.HttpException(tips, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        catch (error) {
            common_1.Logger.error(`百度敏感词检测服务异常: ${error.message}`, error.stack, 'BadWordsService');
        }
    }
    formarTips(wordList) {
        const categorys = wordList.map(t => t.category);
        const unSet = [...new Set(categorys)];
        return `您提交的内容中包含${unSet.join(',')}的信息、我们已对您账号进行标记、请合规使用！`;
    }
    async loadBadWords() {
        const data = await this.badWordsEntity.find({
            where: { status: 1 },
            select: ['word'],
        });
        this.badWords = data.map(t => t.word);
    }
    async queryBadWords(query) {
        const { page = 1, size = 500, word, status } = query;
        const where = {};
        [0, 1, '0', '1'].includes(status) && (where.status = status);
        word && (where.word = (0, typeorm_2.Like)(`%${word}%`));
        const [rows, count] = await this.badWordsEntity.findAndCount({
            where,
            skip: (page - 1) * size,
            take: size,
            order: { id: 'ASC' },
        });
        return { rows, count };
    }
    async delBadWords(body) {
        const b = await this.badWordsEntity.findOne({ where: { id: body.id } });
        if (!b) {
            throw new common_1.HttpException('敏感词不存在,请检查您的提交信息', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.badWordsEntity.delete({ id: body.id });
        if (res.affected > 0) {
            await this.loadBadWords();
            return '删除敏感词成功';
        }
        else {
            throw new common_1.HttpException('删除敏感词失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async updateBadWords(body) {
        const { id, word, status } = body;
        const b = await this.badWordsEntity.findOne({ where: { word } });
        if (b) {
            throw new common_1.HttpException('敏感词已经存在了、请勿重复添加', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.badWordsEntity.update({ id }, { word, status });
        if (res.affected > 0) {
            await this.loadBadWords();
            return '更新敏感词成功';
        }
        else {
            throw new common_1.HttpException('更新敏感词失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async addBadWord(body) {
        const { word } = body;
        const b = await this.badWordsEntity.findOne({ where: { word } });
        if (b) {
            throw new common_1.HttpException('敏感词已存在,请检查您的提交信息', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.badWordsEntity.save({ word });
        await this.loadBadWords();
        return '添加敏感词成功';
    }
    async recordUserBadWords(userId, content, words, typeCn, typeOriginCn) {
        const data = {
            userId,
            content,
            words: JSON.stringify(words),
            typeCn: JSON.stringify(typeCn),
            typeOriginCn,
        };
        try {
            await this.userEntity
                .createQueryBuilder()
                .update(user_entity_1.UserEntity)
                .set({ violationCount: () => 'violationCount + 1' })
                .where('id = :userId', { userId })
                .execute();
            await this.violationLogEntity.save(data);
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async violation(req, query) {
        const { role } = req.user;
        const { page = 1, size = 10, userId, typeOriginCn } = query;
        const where = {};
        userId && (where['userId'] = userId);
        typeOriginCn && (where['typeOriginCn'] = typeOriginCn);
        const [rows, count] = await this.violationLogEntity.findAndCount({
            where,
            skip: (page - 1) * size,
            take: size,
            order: { id: 'DESC' },
        });
        const userIds = [...new Set(rows.map(t => t.userId))];
        const usersInfo = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
            select: ['id', 'avatar', 'username', 'email', 'violationCount', 'status'],
        });
        rows.forEach((t) => {
            const user = usersInfo.find(u => u.id === t.userId) || {};
            role !== 'super' && (user.email = (0, utils_1.hideString)(user.email));
            t.userInfo = user;
        });
        return { rows, count };
    }
};
exports.BadWordsService = BadWordsService;
exports.BadWordsService = BadWordsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(badWords_entity_1.BadWordsEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(violationLog_entity_1.ViolationLogEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _c : Object, typeof (_d = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _d : Object])
], BadWordsService);


/***/ }),
/* 144 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BadWordsEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let BadWordsEntity = class BadWordsEntity extends baseEntity_1.BaseEntity {
    word;
    status;
    count;
};
exports.BadWordsEntity = BadWordsEntity;
__decorate([
    (0, typeorm_1.Column)({ length: 20, comment: '敏感词' }),
    __metadata("design:type", String)
], BadWordsEntity.prototype, "word", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 1, comment: '敏感词开启状态' }),
    __metadata("design:type", Number)
], BadWordsEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, comment: '敏感词触发次数' }),
    __metadata("design:type", Number)
], BadWordsEntity.prototype, "count", void 0);
exports.BadWordsEntity = BadWordsEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'bad_words' })
], BadWordsEntity);


/***/ }),
/* 145 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ViolationLogEntity = void 0;
const typeorm_1 = __webpack_require__(3);
const baseEntity_1 = __webpack_require__(72);
let ViolationLogEntity = class ViolationLogEntity extends baseEntity_1.BaseEntity {
    userId;
    content;
    words;
    typeCn;
    typeOriginCn;
};
exports.ViolationLogEntity = ViolationLogEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户id' }),
    __metadata("design:type", Number)
], ViolationLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '违规内容', type: 'text' }),
    __metadata("design:type", String)
], ViolationLogEntity.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '敏感词', type: 'text' }),
    __metadata("design:type", String)
], ViolationLogEntity.prototype, "words", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '违规类型' }),
    __metadata("design:type", String)
], ViolationLogEntity.prototype, "typeCn", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '违规检测失败于哪个平台' }),
    __metadata("design:type", String)
], ViolationLogEntity.prototype, "typeOriginCn", void 0);
exports.ViolationLogEntity = ViolationLogEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'violation_log' })
], ViolationLogEntity);


/***/ }),
/* 146 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AddBadWordDto = void 0;
const swagger_1 = __webpack_require__(14);
class AddBadWordDto {
    word;
}
exports.AddBadWordDto = AddBadWordDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'test', description: '敏感词', required: true }),
    __metadata("design:type", String)
], AddBadWordDto.prototype, "word", void 0);


/***/ }),
/* 147 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DelBadWordsDto = void 0;
const swagger_1 = __webpack_require__(14);
class DelBadWordsDto {
    id;
}
exports.DelBadWordsDto = DelBadWordsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '敏感词id', required: true }),
    __metadata("design:type", Number)
], DelBadWordsDto.prototype, "id", void 0);


/***/ }),
/* 148 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryBadWordsDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QueryBadWordsDto {
    page;
    size;
    word;
    status;
}
exports.QueryBadWordsDto = QueryBadWordsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryBadWordsDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryBadWordsDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'test', description: '敏感词内容', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryBadWordsDto.prototype, "word", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '关键词状态', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryBadWordsDto.prototype, "status", void 0);


/***/ }),
/* 149 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryViolationDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QueryViolationDto {
    page;
    size;
    userId;
    typeOriginCn;
}
exports.QueryViolationDto = QueryViolationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryViolationDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryViolationDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '用户ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryViolationDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '百度云检测',
        description: '检测平台来源',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QueryViolationDto.prototype, "typeOriginCn", void 0);


/***/ }),
/* 150 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateBadWordsDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class UpdateBadWordsDto {
    id;
    word;
    status;
}
exports.UpdateBadWordsDto = UpdateBadWordsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '敏感词id', required: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateBadWordsDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'test', description: '敏感词内容', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateBadWordsDto.prototype, "word", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '关键词状态', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateBadWordsDto.prototype, "status", void 0);


/***/ }),
/* 151 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const chat_service_1 = __webpack_require__(152);
const netSearch_service_1 = __webpack_require__(154);
const app_entity_1 = __webpack_require__(106);
const app_service_1 = __webpack_require__(105);
const appCats_entity_1 = __webpack_require__(107);
const userApps_entity_1 = __webpack_require__(108);
const autoReply_entity_1 = __webpack_require__(136);
const autoReply_service_1 = __webpack_require__(135);
const badWords_entity_1 = __webpack_require__(144);
const badWords_service_1 = __webpack_require__(143);
const violationLog_entity_1 = __webpack_require__(145);
const chatGroup_entity_1 = __webpack_require__(82);
const chatGroup_service_1 = __webpack_require__(155);
const chatLog_entity_1 = __webpack_require__(75);
const chatLog_service_1 = __webpack_require__(157);
const cramiPackage_entity_1 = __webpack_require__(71);
const config_entity_1 = __webpack_require__(73);
const globalConfig_service_1 = __webpack_require__(74);
const mailer_service_1 = __webpack_require__(95);
const models_entity_1 = __webpack_require__(78);
const models_service_1 = __webpack_require__(76);
const plugin_entity_1 = __webpack_require__(159);
const redisCache_service_1 = __webpack_require__(28);
const upload_service_1 = __webpack_require__(160);
const user_entity_1 = __webpack_require__(83);
const user_service_1 = __webpack_require__(97);
const accountLog_entity_1 = __webpack_require__(79);
const balance_entity_1 = __webpack_require__(80);
const fingerprint_entity_1 = __webpack_require__(84);
const userBalance_entity_1 = __webpack_require__(81);
const userBalance_service_1 = __webpack_require__(34);
const verification_entity_1 = __webpack_require__(101);
const verification_service_1 = __webpack_require__(100);
const chat_controller_1 = __webpack_require__(167);
const chat_service_2 = __webpack_require__(168);
let ChatModule = class ChatModule {
};
exports.ChatModule = ChatModule;
exports.ChatModule = ChatModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                balance_entity_1.BalanceEntity,
                user_entity_1.UserEntity,
                plugin_entity_1.PluginEntity,
                verification_entity_1.VerificationEntity,
                chatLog_entity_1.ChatLogEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                user_entity_1.UserEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                chatGroup_entity_1.ChatGroupEntity,
                app_entity_1.AppEntity,
                userBalance_entity_1.UserBalanceEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                appCats_entity_1.AppCatsEntity,
                userApps_entity_1.UserAppsEntity,
                autoReply_entity_1.AutoReplyEntity,
                badWords_entity_1.BadWordsEntity,
                violationLog_entity_1.ViolationLogEntity,
                models_entity_1.ModelsEntity,
            ]),
        ],
        controllers: [chat_controller_1.ChatController],
        providers: [
            chat_service_2.ChatService,
            userBalance_service_1.UserBalanceService,
            user_service_1.UserService,
            verification_service_1.VerificationService,
            chatLog_service_1.ChatLogService,
            redisCache_service_1.RedisCacheService,
            mailer_service_1.MailerService,
            globalConfig_service_1.GlobalConfigService,
            upload_service_1.UploadService,
            autoReply_service_1.AutoReplyService,
            badWords_service_1.BadWordsService,
            chatGroup_service_1.ChatGroupService,
            models_service_1.ModelsService,
            chat_service_1.OpenAIChatService,
            netSearch_service_1.NetSearchService,
            app_service_1.AppService,
        ],
        exports: [chat_service_2.ChatService],
    })
], ChatModule);


/***/ }),
/* 152 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OpenAIChatService = void 0;
const utils_1 = __webpack_require__(36);
const correctApiBaseUrl_1 = __webpack_require__(70);
const common_1 = __webpack_require__(2);
const openai_1 = __webpack_require__(153);
const globalConfig_service_1 = __webpack_require__(74);
const netSearch_service_1 = __webpack_require__(154);
let OpenAIChatService = class OpenAIChatService {
    globalConfigService;
    netSearchService;
    constructor(globalConfigService, netSearchService) {
        this.globalConfigService = globalConfigService;
        this.netSearchService = netSearchService;
    }
    async handleDeepThinking(messagesHistory, inputs, result) {
        const { apiKey, model, proxyUrl, timeout, usingDeepThinking, searchResults, abortController, deepThinkingType, onProgress, } = inputs;
        const { openaiBaseUrl, openaiBaseKey, openaiBaseModel, deepThinkingUrl, deepThinkingKey, deepThinkingModel, } = await this.globalConfigService.getConfigs([
            'openaiBaseUrl',
            'openaiBaseKey',
            'openaiBaseModel',
            'deepThinkingUrl',
            'deepThinkingKey',
            'deepThinkingModel',
        ]);
        if (!usingDeepThinking && deepThinkingType !== 2) {
            return false;
        }
        const deepUrl = deepThinkingType === 2 ? proxyUrl : deepThinkingUrl || openaiBaseUrl;
        const deepKey = deepThinkingType === 2 ? apiKey : deepThinkingKey || openaiBaseKey;
        const deepModel = deepThinkingType === 2 ? model : deepThinkingModel || openaiBaseModel;
        let shouldEndThinkStream = false;
        let thinkingSourceType = null;
        const processedMessages = JSON.parse(JSON.stringify(messagesHistory)).map((message) => {
            if (message.role === 'user' && Array.isArray(message.content)) {
                message.content = message.content
                    .filter((item) => item.type !== 'image_url')
                    .map((item) => item.text || item)
                    .join('');
            }
            return message;
        });
        const systemMessageIndex = processedMessages.findIndex((msg) => msg.role === 'system');
        let additionalContent = '';
        if (searchResults && searchResults.length > 0) {
            let searchPrompt = JSON.stringify(searchResults, null, 2);
            additionalContent += `\n\n以下是网络搜索结果（请基于这些信息回答用户问题，这些信息比你的训练数据更新）：\n${searchPrompt}`;
        }
        if (systemMessageIndex !== -1) {
            processedMessages[systemMessageIndex].content += additionalContent;
        }
        else if (additionalContent) {
            processedMessages.unshift({
                role: 'system',
                content: additionalContent,
            });
        }
        const correctedDeepUrl = await (0, correctApiBaseUrl_1.correctApiBaseUrl)(deepUrl);
        const thinkOpenai = new openai_1.default({
            apiKey: deepKey,
            baseURL: correctedDeepUrl,
            timeout: timeout * 5,
        });
        common_1.Logger.debug(`思考流请求 - Messages: ${JSON.stringify(processedMessages)}`, 'OpenAIChatService');
        const requestConfig = {
            model: deepModel,
            messages: processedMessages,
            stream: true,
        };
        const stream = await thinkOpenai.chat.completions.create(requestConfig, {
            signal: abortController.signal,
        });
        for await (const chunk of stream) {
            if (abortController.signal.aborted || shouldEndThinkStream) {
                break;
            }
            const delta = chunk.choices[0]?.delta;
            common_1.Logger.debug(`思考流delta: ${JSON.stringify(delta)}`, 'OpenAIChatService');
            const content = delta?.content;
            const reasoning_content = delta?.reasoning_content || '';
            if (thinkingSourceType === 'reasoning_content') {
                if (reasoning_content) {
                    common_1.Logger.debug(`继续接收reasoning_content思考流: ${reasoning_content}`, 'OpenAIChatService');
                    result.reasoning_content = [
                        {
                            type: 'text',
                            text: reasoning_content,
                        },
                    ];
                    result.full_reasoning_content += reasoning_content;
                    onProgress?.({
                        reasoning_content: result.reasoning_content,
                    });
                }
                else if (content && !content.includes('<think>')) {
                    common_1.Logger.debug(`reasoning_content模式下收到普通content: ${content}`, 'OpenAIChatService');
                    if (deepThinkingType === 2) {
                        result.content = [
                            {
                                type: 'text',
                                text: content,
                            },
                        ];
                        result.full_content += content;
                        onProgress?.({
                            content: result.content,
                        });
                    }
                    else {
                        shouldEndThinkStream = true;
                    }
                }
                continue;
            }
            else if (thinkingSourceType === 'think_tag') {
                if (content) {
                    if (content.includes('</think>')) {
                        common_1.Logger.debug(`检测到</think>标签，思考流结束`, 'OpenAIChatService');
                        const regex = /([\s\S]*?)<\/think>([\s\S]*)/;
                        const matches = content.match(regex);
                        if (matches) {
                            const thinkContent = matches[1] || '';
                            const remainingContent = matches[2] || '';
                            if (thinkContent) {
                                result.reasoning_content = [
                                    {
                                        type: 'text',
                                        text: thinkContent,
                                    },
                                ];
                                result.full_reasoning_content += thinkContent;
                                onProgress?.({
                                    reasoning_content: result.reasoning_content,
                                });
                            }
                            if (deepThinkingType === 2 && remainingContent) {
                                result.content = [
                                    {
                                        type: 'text',
                                        text: remainingContent,
                                    },
                                ];
                                result.full_content += remainingContent;
                                onProgress?.({
                                    content: result.content,
                                });
                            }
                        }
                        if (deepThinkingType !== 2) {
                            shouldEndThinkStream = true;
                        }
                        else {
                            thinkingSourceType = 'normal_content';
                        }
                    }
                    else {
                        common_1.Logger.debug(`继续接收think标签思考流: ${content}`, 'OpenAIChatService');
                        result.reasoning_content = [
                            {
                                type: 'text',
                                text: content,
                            },
                        ];
                        result.full_reasoning_content += content;
                        onProgress?.({
                            reasoning_content: result.reasoning_content,
                        });
                    }
                }
                continue;
            }
            else if (thinkingSourceType === 'normal_content' && deepThinkingType === 2) {
                if (content) {
                    result.content = [
                        {
                            type: 'text',
                            text: content,
                        },
                    ];
                    result.full_content += content;
                    onProgress?.({
                        content: result.content,
                    });
                }
                continue;
            }
            if (reasoning_content) {
                common_1.Logger.debug(`首次检测到reasoning_content，确定使用reasoning_content思考流方式: ${reasoning_content}`, 'OpenAIChatService');
                thinkingSourceType = 'reasoning_content';
                result.reasoning_content = [
                    {
                        type: 'text',
                        text: reasoning_content,
                    },
                ];
                result.full_reasoning_content += reasoning_content;
                onProgress?.({
                    reasoning_content: result.reasoning_content,
                });
            }
            else if (content) {
                if (content.includes('<think>')) {
                    common_1.Logger.debug(`首次检测到<think>标签，确定使用think标签思考流方式`, 'OpenAIChatService');
                    thinkingSourceType = 'think_tag';
                    const thinkContent = content.replace(/<think>/, '');
                    if (thinkContent) {
                        common_1.Logger.debug(`从<think>标签中提取的初始思考内容: ${thinkContent}`, 'OpenAIChatService');
                        result.reasoning_content = [
                            {
                                type: 'text',
                                text: thinkContent,
                            },
                        ];
                        result.full_reasoning_content += thinkContent;
                        onProgress?.({
                            reasoning_content: result.reasoning_content,
                        });
                        if (content.includes('</think>')) {
                            common_1.Logger.debug('在首个块中检测到</think>标签', 'OpenAIChatService');
                            const regex = /<think>([\s\S]*?)<\/think>([\s\S]*)/;
                            const matches = content.match(regex);
                            if (matches) {
                                const fullThinkContent = matches[1] || '';
                                const remainingContent = matches[2] || '';
                                result.reasoning_content = [
                                    {
                                        type: 'text',
                                        text: fullThinkContent,
                                    },
                                ];
                                result.full_reasoning_content = fullThinkContent;
                                onProgress?.({
                                    reasoning_content: result.reasoning_content,
                                });
                                if (deepThinkingType === 2 && remainingContent) {
                                    result.content = [
                                        {
                                            type: 'text',
                                            text: remainingContent,
                                        },
                                    ];
                                    result.full_content += remainingContent;
                                    onProgress?.({
                                        content: result.content,
                                    });
                                }
                            }
                            if (deepThinkingType !== 2) {
                                shouldEndThinkStream = true;
                            }
                            else {
                                thinkingSourceType = 'normal_content';
                            }
                        }
                    }
                }
                else {
                    common_1.Logger.debug(`没有检测到思考流标记，处理普通内容: ${content}`, 'OpenAIChatService');
                    if (deepThinkingType === 2) {
                        thinkingSourceType = 'normal_content';
                        result.content = [
                            {
                                type: 'text',
                                text: content,
                            },
                        ];
                        result.full_content += content;
                        onProgress?.({
                            content: result.content,
                        });
                    }
                    else {
                        shouldEndThinkStream = true;
                    }
                }
            }
        }
        common_1.Logger.debug('思考流处理完成', 'OpenAIChatService');
        return deepThinkingType === 2 && result.full_content.length > 0;
    }
    async handleRegularResponse(messagesHistory, inputs, result) {
        const { apiKey, model, proxyUrl, timeout, temperature, max_tokens, searchResults, images, abortController, onProgress, } = inputs;
        const processedMessages = this.prepareSystemMessage(messagesHistory, {
            searchResults,
            images,
        }, result);
        await this.handleOpenAIChat(processedMessages, {
            apiKey,
            model,
            proxyUrl,
            timeout,
            temperature,
            max_tokens,
            abortController,
            onProgress,
        }, result);
    }
    async chat(messagesHistory, inputs) {
        const { chatId, maxModelTokens, max_tokens, apiKey, model, modelName, temperature, prompt, timeout, proxyUrl, modelAvatar, usingDeepThinking, usingNetwork, extraParam, deepThinkingType, onProgress, onFailure, onDatabase, abortController, } = inputs;
        const originalMessagesHistory = JSON.parse(JSON.stringify(messagesHistory));
        const result = {
            chatId,
            modelName,
            modelAvatar,
            model,
            status: 2,
            full_content: '',
            full_reasoning_content: '',
            networkSearchResult: '',
            fileVectorResult: '',
            finishReason: null,
        };
        try {
            const { searchResults, images } = await this.netSearchService.processNetSearch(prompt || '', {
                usingNetwork,
                onProgress,
                onDatabase,
            }, result);
            const shouldEndRequest = await this.handleDeepThinking(messagesHistory, {
                apiKey,
                model,
                proxyUrl,
                timeout,
                usingDeepThinking,
                searchResults,
                abortController,
                deepThinkingType,
                onProgress,
            }, result);
            if (shouldEndRequest) {
                result.content = '';
                result.reasoning_content = '';
                result.finishReason = 'stop';
                return result;
            }
            await this.handleRegularResponse(originalMessagesHistory, {
                apiKey,
                model,
                proxyUrl,
                timeout,
                temperature,
                max_tokens,
                extraParam,
                searchResults,
                images,
                abortController,
                onProgress,
            }, result);
            result.content = [
                {
                    type: 'text',
                    text: '',
                },
            ];
            result.reasoning_content = [
                {
                    type: 'text',
                    text: '',
                },
            ];
            result.finishReason = 'stop';
            return result;
        }
        catch (error) {
            const errorMessage = (0, utils_1.handleError)(error);
            common_1.Logger.error(`对话请求失败: ${errorMessage}`, 'OpenAIChatService');
            result.errMsg = errorMessage;
            onFailure?.(result);
            return result;
        }
    }
    async chatFree(prompt, systemMessage, messagesHistory, imageUrl) {
        const { openaiBaseUrl = '', openaiBaseKey = '', openaiBaseModel, } = await this.globalConfigService.getConfigs([
            'openaiBaseKey',
            'openaiBaseUrl',
            'openaiBaseModel',
        ]);
        const key = openaiBaseKey;
        const proxyUrl = openaiBaseUrl;
        let requestData = [];
        if (systemMessage) {
            requestData.push({
                role: 'system',
                content: systemMessage,
            });
        }
        if (messagesHistory && messagesHistory.length > 0) {
            requestData = requestData.concat(messagesHistory);
        }
        else {
            if (imageUrl) {
                requestData.push({
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompt,
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl,
                            },
                        },
                    ],
                });
            }
            else {
                requestData.push({
                    role: 'user',
                    content: prompt,
                });
            }
        }
        try {
            const openai = new openai_1.default({
                apiKey: key,
                baseURL: await (0, correctApiBaseUrl_1.correctApiBaseUrl)(proxyUrl),
            });
            const response = await openai.chat.completions.create({
                model: openaiBaseModel || 'gpt-4o-mini',
                messages: requestData,
            }, {
                timeout: 30000,
            });
            return response.choices[0].message.content;
        }
        catch (error) {
            const errorMessage = (0, utils_1.handleError)(error);
            common_1.Logger.error(`全局模型调用失败: ${errorMessage}`, 'OpenAIChatService');
            return;
        }
    }
    prepareSystemMessage(messagesHistory, inputs, result) {
        const { searchResults, images } = inputs;
        const processedMessages = JSON.parse(JSON.stringify(messagesHistory));
        const systemMessage = processedMessages?.find((message) => message.role === 'system');
        if (systemMessage) {
            const imageUrlMessages = processedMessages?.filter((message) => message.type === 'image_url') || [];
            let updatedContent = '';
            if (result.full_reasoning_content) {
                updatedContent = `\n\n以下是针对这个问题的思考推理思路（思路不一定完全正确，仅供参考）：\n${result.full_reasoning_content}`;
            }
            if (searchResults && searchResults.length > 0) {
                let searchPrompt = JSON.stringify(searchResults, null, 2);
                let imagesPrompt = '';
                if (images && images.length > 0) {
                    imagesPrompt = `\n\n以下是搜索到的相关图片链接:\n${images.join('\n')}`;
                }
                const now = new Date();
                const options = {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                };
                const currentDate = new Intl.DateTimeFormat('zh-CN', options).format(now);
                updatedContent += `
          \n\n你的任务是根据用户的问题，通过下面的搜索结果提供更精确、详细、具体的回答。
          请在适当的情况下在对应部分句子末尾标注引用的链接，使用[[序号](链接地址)]格式，同时使用多个链接可连续使用比如[[2](链接地址)][[5](链接地址)]，以下是搜索结果：
            ${searchPrompt}${imagesPrompt}
            在回答时，请注意以下几点：
              - 现在时间是: ${currentDate}。
              - 如果结果中包含图片链接，可在适当位置使用MarkDown格式插入至少一张图片，让回答图文并茂。
              - 并非搜索结果的所有内容都与用户的问题密切相关，你需要结合问题，对搜索结果进行甄别、筛选。
              - 对于列举类的问题（如列举所有航班信息），尽量将答案控制在10个要点以内，并告诉用户可以查看搜索来源、获得完整信息。优先提供信息完整、最相关的列举项；如非必要，不要主动告诉用户搜索结果未提供的内容。
              - 对于创作类的问题（如写论文），请务必在正文的段落中引用对应的参考编号。你需要解读并概括用户的题目要求，选择合适的格式，充分利用搜索结果并抽取重要信息，生成符合用户要求、极具思想深度、富有创造力与专业性的答案。你的创作篇幅需要尽可能延长，对于每一个要点的论述要推测用户的意图，给出尽可能多角度的回答要点，且务必信息量大、论述详尽。
              - 如果回答很长，请尽量结构化、分段落总结。如果需要分点作答，尽量控制在5个点以内，并合并相关的内容。
              - 对于客观类的问答，如果问题的答案非常简短，可以适当补充一到两句相关信息，以丰富内容。
              - 你需要根据用户要求和回答内容选择合适、美观的回答格式，确保可读性强。
              - 你的回答应该综合多个相关网页来回答，不能只重复引用一个网页。
              - 除非用户要求，否则你回答的语言需要和用户提问的语言保持一致。
            `;
            }
            if (imageUrlMessages && imageUrlMessages.length > 0) {
                imageUrlMessages.forEach((imageMessage) => {
                    updatedContent = `${updatedContent}\n${JSON.stringify(imageMessage)}`;
                });
            }
            systemMessage.content += updatedContent;
        }
        return processedMessages;
    }
    async handleOpenAIChat(messagesHistory, inputs, result) {
        const { apiKey, model, proxyUrl, timeout, temperature, max_tokens, abortController, onProgress, } = inputs;
        const streamData = {
            model,
            messages: messagesHistory,
            stream: true,
            temperature,
        };
        const openai = new openai_1.default({
            apiKey: apiKey,
            baseURL: await (0, correctApiBaseUrl_1.correctApiBaseUrl)(proxyUrl),
            timeout: timeout,
        });
        try {
            common_1.Logger.debug(`对话请求 - Messages: ${JSON.stringify(streamData.messages)}`, 'OpenAIChatService');
            const stream = await openai.chat.completions.create({
                model: streamData.model,
                messages: streamData.messages,
                stream: true,
                max_tokens: max_tokens,
                temperature: streamData.temperature,
            }, {
                signal: abortController.signal,
            });
            for await (const chunk of stream) {
                if (abortController.signal.aborted) {
                    break;
                }
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    result.content = [
                        {
                            type: 'text',
                            text: content,
                        },
                    ];
                    result.full_content += content;
                    onProgress?.({
                        content: result.content,
                    });
                }
            }
        }
        catch (error) {
            common_1.Logger.error(`OpenAI请求失败: ${(0, utils_1.handleError)(error)}`, 'OpenAIChatService');
            throw error;
        }
    }
};
exports.OpenAIChatService = OpenAIChatService;
exports.OpenAIChatService = OpenAIChatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _a : Object, typeof (_b = typeof netSearch_service_1.NetSearchService !== "undefined" && netSearch_service_1.NetSearchService) === "function" ? _b : Object])
], OpenAIChatService);


/***/ }),
/* 153 */
/***/ ((module) => {

module.exports = require("openai");

/***/ }),
/* 154 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NetSearchService = void 0;
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const globalConfig_service_1 = __webpack_require__(74);
let NetSearchService = class NetSearchService {
    globalConfigService;
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    async processNetSearch(prompt, inputs, result) {
        const { usingNetwork, onProgress, onDatabase } = inputs;
        let searchResults = [];
        let images = [];
        if (!usingNetwork) {
            return { searchResults, images };
        }
        try {
            common_1.Logger.log(`[网络搜索] 开始搜索: ${prompt}`, 'NetSearchService');
            const searchResponse = await this.webSearchPro(prompt);
            searchResults = searchResponse.searchResults;
            images = searchResponse.images;
            common_1.Logger.log(`[网络搜索] 完成，获取到 ${searchResults.length} 条结果和 ${images.length} 张图片`, 'NetSearchService');
            result.networkSearchResult = JSON.stringify(searchResults);
            onProgress?.({
                networkSearchResult: result.networkSearchResult,
            });
            onDatabase?.({
                networkSearchResult: JSON.stringify(searchResults.map((item) => {
                    const { content, ...rest } = item;
                    return rest;
                }), null, 2),
            });
            return { searchResults, images };
        }
        catch (error) {
            common_1.Logger.error(`[网络搜索] 失败: ${(0, utils_1.handleError)(error)}`, 'NetSearchService');
            onDatabase?.({
                network_search_error: {
                    error: (0, utils_1.handleError)(error),
                    query: prompt,
                    timestamp: new Date(),
                },
            });
            return { searchResults: [], images: [] };
        }
    }
    async webSearchPro(prompt) {
        try {
            const { pluginUrl, pluginKey } = await this.globalConfigService.getConfigs([
                'pluginUrl',
                'pluginKey',
            ]);
            if (!pluginUrl || !pluginKey) {
                common_1.Logger.warn('搜索插件配置缺失');
                return { searchResults: [], images: [] };
            }
            const keys = pluginKey.split(',').filter(key => key.trim());
            const selectedKey = keys[Math.floor(Math.random() * keys.length)];
            const isBochaiApi = pluginUrl.includes('bochaai.com');
            const isBigModelApi = pluginUrl.includes('bigmodel.cn');
            const isTavilyApi = pluginUrl.includes('tavily.com');
            common_1.Logger.log(`[搜索] API类型: ${isBochaiApi ? 'Bochai' : isBigModelApi ? 'BigModel' : isTavilyApi ? 'Tavily' : '未知'}`);
            common_1.Logger.log(`[搜索] 请求URL: ${pluginUrl}`);
            common_1.Logger.log(`[搜索] 搜索关键词: ${prompt}`);
            const requestBody = isBochaiApi
                ? {
                    query: prompt,
                    summary: true,
                    count: 20,
                }
                : isTavilyApi
                    ? {
                        query: prompt,
                        search_depth: 'basic',
                        include_answer: false,
                        include_images: true,
                        max_results: 10,
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
                return { searchResults: [], images: [] };
            }
            const apiResult = await response.json();
            common_1.Logger.log(`[搜索] 原始返回数据: ${JSON.stringify(apiResult, null, 2)}`);
            let searchResults = [];
            if (isBochaiApi) {
                if (apiResult?.code === 200 && apiResult?.data?.webPages?.value) {
                    searchResults = apiResult.data.webPages.value.map((item) => ({
                        title: item?.name || '',
                        link: item?.url || '',
                        content: item?.summary || '',
                        icon: item?.siteIcon || '',
                        media: item?.siteName || '',
                    }));
                }
            }
            else if (isBigModelApi) {
                if (apiResult?.choices?.[0]?.message?.tool_calls?.length > 0) {
                    for (const toolCall of apiResult.choices[0].message.tool_calls) {
                        if (Array.isArray(toolCall.search_result)) {
                            searchResults = toolCall.search_result.map((item) => ({
                                title: item?.title || '',
                                link: item?.link || '',
                                content: item?.content || '',
                                icon: item?.icon || '',
                                media: item?.media || '',
                            }));
                            break;
                        }
                    }
                }
            }
            else if (isTavilyApi) {
                if (Array.isArray(apiResult?.results)) {
                    searchResults = apiResult.results.map((item) => ({
                        title: item?.title || '',
                        link: item?.url || '',
                        content: item?.raw_content || item?.content || '',
                        icon: '',
                        media: '',
                    }));
                }
            }
            const formattedResult = searchResults.map((item, index) => ({
                resultIndex: index + 1,
                ...item,
            }));
            let images = [];
            if (isTavilyApi && Array.isArray(apiResult?.images)) {
                images = apiResult.images;
            }
            if (isBochaiApi) {
                if (apiResult?.data?.images?.value && Array.isArray(apiResult.data.images.value)) {
                    images = apiResult.data.images.value
                        .filter(img => img.contentUrl)
                        .map(img => img.contentUrl);
                }
            }
            common_1.Logger.log(`[搜索] 格式化后的结果: ${JSON.stringify(formattedResult, null, 2)}`);
            return {
                searchResults: formattedResult,
                images: images,
            };
        }
        catch (fetchError) {
            common_1.Logger.error('[搜索] 调用接口出错:', fetchError);
            return {
                searchResults: [],
                images: [],
            };
        }
    }
};
exports.NetSearchService = NetSearchService;
exports.NetSearchService = NetSearchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _a : Object])
], NetSearchService);


/***/ }),
/* 155 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatGroupService = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const axios_1 = __webpack_require__(39);
const pdf = __webpack_require__(156);
const typeorm_2 = __webpack_require__(3);
const app_entity_1 = __webpack_require__(106);
const models_service_1 = __webpack_require__(76);
const chatGroup_entity_1 = __webpack_require__(82);
let ChatGroupService = class ChatGroupService {
    chatGroupEntity;
    appEntity;
    modelsService;
    constructor(chatGroupEntity, appEntity, modelsService) {
        this.chatGroupEntity = chatGroupEntity;
        this.appEntity = appEntity;
        this.modelsService = modelsService;
    }
    async create(body, req) {
        const { id } = req.user;
        const { appId, modelConfig: bodyModelConfig, params } = body;
        let modelConfig = bodyModelConfig || (await this.modelsService.getBaseConfig());
        const modelDetail = await this.modelsService.getModelDetailByName(modelConfig.modelInfo.model);
        if (modelDetail) {
            modelConfig.modelInfo.modelName = modelDetail.modelName;
            modelConfig.modelInfo.deductType = modelDetail.deductType;
            modelConfig.modelInfo.deduct = modelDetail.deduct;
            modelConfig.modelInfo.isFileUpload = modelDetail.isFileUpload;
            modelConfig.modelInfo.isImageUpload = modelDetail.isImageUpload;
            modelConfig.modelInfo.isNetworkSearch = modelDetail.isNetworkSearch;
            modelConfig.modelInfo.deepThinkingType = modelDetail.deepThinkingType;
            modelConfig.modelInfo.isMcpTool = modelDetail.isMcpTool;
        }
        if (!modelConfig) {
            throw new common_1.HttpException('管理员未配置任何AI模型、请先联系管理员开通聊天模型配置！', common_1.HttpStatus.BAD_REQUEST);
        }
        modelConfig = JSON.parse(JSON.stringify(modelConfig));
        const groupParams = { title: '新对话', userId: id, appId, params };
        if (appId) {
            const appInfo = await this.appEntity.findOne({ where: { id: appId } });
            if (!appInfo) {
                throw new common_1.HttpException('非法操作、您在使用一个不存在的应用！', common_1.HttpStatus.BAD_REQUEST);
            }
            const { status, name, isFixedModel, isGPTs, coverImg, appModel, isFlowith } = appInfo;
            if (isFixedModel && appModel) {
                const modelDetail = await this.modelsService.getModelDetailByName(appModel);
                common_1.Logger.debug(`modelDetail: ${modelDetail}`);
                if (modelDetail) {
                    modelConfig.modelInfo.modelName = modelDetail.modelName;
                    modelConfig.modelInfo.deductType = modelDetail.deductType;
                    modelConfig.modelInfo.deduct = modelDetail.deduct;
                    modelConfig.modelInfo.isFileUpload = modelDetail.isFileUpload;
                    modelConfig.modelInfo.isImageUpload = modelDetail.isImageUpload;
                    modelConfig.modelInfo.isNetworkSearch = modelDetail.isNetworkSearch;
                    modelConfig.modelInfo.deepThinkingType = modelDetail.deepThinkingType;
                    modelConfig.modelInfo.isMcpTool = modelDetail.isMcpTool;
                }
            }
            Object.assign(modelConfig.modelInfo, {
                isGPTs,
                isFixedModel,
                isFlowith,
                modelAvatar: coverImg,
                modelName: name,
            });
            if (isGPTs === 1 || isFixedModel === 1 || isFlowith === 1) {
                const appModelKey = await this.modelsService.getCurrentModelKeyInfo(isFixedModel === 1 ? appModel : isFlowith === 1 ? 'flowith' : isGPTs === 1 ? 'gpts' : '');
                Object.assign(modelConfig.modelInfo, {
                    deductType: appModelKey.deductType,
                    deduct: appModelKey.deduct,
                    model: appModel,
                    isFileUpload: appModelKey.isFileUpload,
                    isImageUpload: appModelKey.isImageUpload,
                });
            }
            if (![1, 3, 4, 5].includes(status)) {
                throw new common_1.HttpException('非法操作、您在使用一个未启用的应用！', common_1.HttpStatus.BAD_REQUEST);
            }
            if (name) {
                groupParams.title = name;
            }
        }
        const newGroup = await this.chatGroupEntity.save({
            ...groupParams,
            config: JSON.stringify(modelConfig),
        });
        return newGroup;
    }
    async query(req) {
        try {
            const { id } = req.user;
            const params = { userId: id, isDelete: false };
            const res = await this.chatGroupEntity.find({
                where: params,
                order: { isSticky: 'DESC', updatedAt: 'DESC' },
            });
            return res;
            const appIds = res.filter(t => t.appId).map(t => t.appId);
            const appInfos = await this.appEntity.find({ where: { id: (0, typeorm_2.In)(appIds) } });
            return res.map((item) => {
                item.appLogo = appInfos.find(t => t.id === item.appId)?.coverImg;
                return item;
            });
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async update(body, req) {
        const { title, isSticky, groupId, config, fileUrl } = body;
        const { id } = req.user;
        const g = await this.chatGroupEntity.findOne({
            where: { id: groupId, userId: id },
        });
        if (!g) {
            throw new common_1.HttpException('请先选择一个对话或者新加一个对话再操作！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { appId } = g;
        if (appId && !title) {
            try {
                const parseData = JSON.parse(config);
                if (Number(parseData.keyType) !== 1) {
                    throw new common_1.HttpException('应用对话名称不能修改哟！', common_1.HttpStatus.BAD_REQUEST);
                }
            }
            catch (error) {
            }
        }
        const data = {};
        title && (data['title'] = title);
        typeof isSticky !== 'undefined' && (data['isSticky'] = isSticky);
        config && (data['config'] = config);
        typeof fileUrl !== 'undefined' && (data['fileUrl'] = fileUrl);
        const u = await this.chatGroupEntity.update({ id: groupId }, data);
        if (u.affected) {
            return true;
        }
        else {
            throw new common_1.HttpException('更新对话失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async extractPdfText(fileUrl) {
        try {
            const response = await axios_1.default.get(fileUrl, {
                responseType: 'arraybuffer',
            });
            const dataBuffer = Buffer.from(response.data);
            const pdfData = await pdf(dataBuffer);
            return pdfData.text;
        }
        catch (error) {
            console.error('PDF 解析失败:', error);
            throw new Error('PDF 解析失败');
        }
    }
    async updateTime(groupId) {
        await this.chatGroupEntity.update(groupId, {
            updatedAt: new Date(),
        });
    }
    async del(body, req) {
        const { groupId } = body;
        const { id } = req.user;
        const g = await this.chatGroupEntity.findOne({
            where: { id: groupId, userId: id },
        });
        if (!g) {
            throw new common_1.HttpException('非法操作、您在删除一个非法资源！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.chatGroupEntity.update({ id: groupId }, { isDelete: true });
        if (r.affected) {
            return '删除成功';
        }
        else {
            throw new common_1.HttpException('删除失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async delAll(req) {
        const { id } = req.user;
        const r = await this.chatGroupEntity.update({ userId: id, isSticky: false, isDelete: false }, { isDelete: true });
        if (r.affected) {
            return '删除成功';
        }
        else {
            throw new common_1.HttpException('删除失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getGroupInfoFromId(id) {
        if (!id)
            return;
        const groupInfo = await this.chatGroupEntity.findOne({ where: { id } });
        if (groupInfo) {
            const { pdfTextContent, ...rest } = groupInfo;
            return rest;
        }
    }
    async getGroupPdfText(groupId) {
        const groupInfo = await this.chatGroupEntity.findOne({
            where: { id: groupId },
        });
        if (groupInfo) {
            return groupInfo.pdfTextContent;
        }
    }
};
exports.ChatGroupService = ChatGroupService;
exports.ChatGroupService = ChatGroupService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(chatGroup_entity_1.ChatGroupEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(app_entity_1.AppEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof models_service_1.ModelsService !== "undefined" && models_service_1.ModelsService) === "function" ? _c : Object])
], ChatGroupService);


/***/ }),
/* 156 */
/***/ ((module) => {

module.exports = require("pdf-parse");

/***/ }),
/* 157 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatLogService = void 0;
const balance_constant_1 = __webpack_require__(35);
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const exceljs_1 = __webpack_require__(158);
const typeorm_2 = __webpack_require__(3);
const chatGroup_entity_1 = __webpack_require__(82);
const user_entity_1 = __webpack_require__(83);
const chatLog_entity_1 = __webpack_require__(75);
const models_service_1 = __webpack_require__(76);
let ChatLogService = class ChatLogService {
    chatLogEntity;
    userEntity;
    chatGroupEntity;
    modelsService;
    constructor(chatLogEntity, userEntity, chatGroupEntity, modelsService) {
        this.chatLogEntity = chatLogEntity;
        this.userEntity = userEntity;
        this.chatGroupEntity = chatGroupEntity;
        this.modelsService = modelsService;
    }
    async saveChatLog(logInfo) {
        const savedLog = await this.chatLogEntity.save(logInfo);
        return savedLog;
    }
    async updateChatLog(id, logInfo) {
        return await this.chatLogEntity.update({ id }, logInfo);
    }
    async findOneChatLog(id) {
        return await this.chatLogEntity.findOne({ where: { id } });
    }
    async querDrawLog(req, query) {
        const { id } = req.user;
        const { model } = query;
        const where = { userId: id, type: balance_constant_1.ChatType.PAINT };
        if (model) {
            where.model = model;
            if (model === 'DALL-E2') {
                where.model = (0, typeorm_2.In)(['DALL-E2', 'dall-e-3']);
            }
        }
        const data = await this.chatLogEntity.find({
            where,
            order: { id: 'DESC' },
            select: ['id', 'answer', 'prompt', 'model', 'type', 'fileInfo'],
        });
        data.forEach((r) => {
            if (r.type === 'paintCount') {
                const w = r.model === 'mj' ? 310 : 160;
                const imgType = r.answer.includes('cos') ? 'tencent' : 'ali';
                const compress = imgType === 'tencent'
                    ? `?imageView2/1/w/${w}/q/55`
                    : `?x-oss-process=image/resize,w_${w}`;
                r.thumbImg = r.answer + compress;
                try {
                    r.fileInfo = r.fileInfo ? JSON.parse(r.fileInfo) : null;
                }
                catch (error) {
                    r.fileInfo = {};
                }
            }
        });
        return data;
    }
    async recDrawImg(body) {
        const { id } = body;
        const l = await this.chatLogEntity.findOne({
            where: { id, type: balance_constant_1.ChatType.PAINT },
        });
        if (!l) {
            throw new common_1.HttpException('你推荐的图片不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const rec = l.rec === 1 ? 0 : 1;
        const res = await this.chatLogEntity.update({ id }, { rec });
        if (res.affected > 0) {
            return `${rec ? '推荐' : '取消推荐'}图片成功！`;
        }
        throw new common_1.HttpException('你操作的图片不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
    }
    async exportExcel(body, res) {
        const where = { type: balance_constant_1.ChatType.NORMAL_CHAT };
        const { page = 1, size = 30, prompt, email } = body;
        prompt && Object.assign(where, { prompt: (0, typeorm_2.Like)(`%${prompt}%`) });
        if (email) {
            const user = await this.userEntity.findOne({ where: { email } });
            user?.id && Object.assign(where, { userId: user.id });
        }
        const [rows, count] = await this.chatLogEntity.findAndCount({
            order: { id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
            where,
        });
        const userIds = rows.map(r => r.userId);
        const userInfos = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
        });
        const data = rows.map(r => {
            const userInfo = userInfos.find(u => u.id === r.userId);
            return {
                username: userInfo ? userInfo.username : '',
                email: userInfo ? userInfo.email : '',
                prompt: r.prompt,
                answer: r.answer,
                createdAt: (0, utils_1.formatDate)(r.createdAt),
            };
        });
        const workbook = new exceljs_1.default.Workbook();
        const worksheet = workbook.addWorksheet('chatlog');
        worksheet.columns = [
            { header: '用户名', key: 'username', width: 20 },
            { header: '用户邮箱', key: 'email', width: 20 },
            { header: '提问时间', key: 'createdAt', width: 20 },
            { header: '提问问题', key: 'prompt', width: 80 },
            { header: '回答答案', key: 'answer', width: 150 },
        ];
        data.forEach(row => worksheet.addRow(row));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + 'chat.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    }
    async querAllChatLog(params, req) {
        const { page = 1, size = 20, userId, prompt, type, model } = params;
        const where = {};
        userId && Object.assign(where, { userId });
        prompt && Object.assign(where, { prompt: (0, typeorm_2.Like)(`%${prompt}%`) });
        type && Object.assign(where, { type });
        model && Object.assign(where, { model });
        const [rows, count] = await this.chatLogEntity.findAndCount({
            order: { id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
            where,
        });
        const userIds = rows.map(item => item.userId);
        const userInfo = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
            select: ['id', 'username', 'email', 'nickname'],
        });
        rows.forEach((item) => {
            const { username, email, nickname } = userInfo.find(u => u.id === item.userId) || {};
            item.username = username;
            item.email = email;
            item.nickname = nickname;
        });
        req.user.role !== 'super' && rows.forEach((t) => (t.email = (0, utils_1.maskEmail)(t.email)));
        rows.forEach((item) => {
            !item.email && (item.email = `${item?.userId}@aiweb.com`);
            !item.username && (item.username = `游客${item?.userId}`);
        });
        return { rows, count };
    }
    async chatList(req, params) {
        const { id } = req.user;
        const { groupId } = params;
        const where = { userId: id, isDelete: false };
        groupId && Object.assign(where, { groupId });
        if (groupId) {
            const count = await this.chatGroupEntity.count({
                where: { isDelete: false },
            });
            if (count === 0)
                return [];
        }
        const list = await this.chatLogEntity.find({ where });
        return list.map(item => {
            const { prompt, role, answer, createdAt, model, modelName, type, status, action, drawId, id, imageUrl, fileInfo, fileUrl, ttsUrl, videoUrl, audioUrl, customId, pluginParam, progress, modelAvatar, taskData, promptReference, networkSearchResult, fileVectorResult, taskId, reasoning_content, tool_calls, content, } = item;
            return {
                chatId: id,
                dateTime: (0, utils_1.formatDate)(createdAt),
                content: content || (role === 'assistant' ? answer : prompt),
                reasoningText: reasoning_content,
                tool_calls: tool_calls,
                modelType: type,
                status: status,
                action: action,
                drawId: drawId,
                customId: customId,
                role: role,
                error: false,
                imageUrl: imageUrl || fileInfo || '',
                fileUrl: fileUrl,
                ttsUrl: ttsUrl,
                videoUrl: videoUrl,
                audioUrl: audioUrl,
                progress,
                model: model,
                modelName: modelName,
                pluginParam: pluginParam,
                modelAvatar: modelAvatar,
                taskData: taskData,
                promptReference: promptReference,
                networkSearchResult: networkSearchResult,
                fileVectorResult: fileVectorResult,
                taskId: taskId,
            };
        });
    }
    async chatHistory(groupId, rounds) {
        if (rounds === 0) {
            return [];
        }
        const where = { isDelete: false, groupId: groupId };
        const list = await this.chatLogEntity.find({
            where,
            order: {
                createdAt: 'DESC',
            },
            take: rounds * 2,
        });
        const result = list
            .map(item => {
            const { role, content, answer, prompt, imageUrl, fileInfo, fileUrl, ttsUrl, videoUrl, audioUrl, reasoning_content, tool_calls, progress, } = item;
            const record = {
                role: role,
                content: content || (role === 'assistant' ? answer : prompt),
                imageUrl: imageUrl || fileInfo || '',
                fileUrl: fileUrl,
                ttsUrl: ttsUrl,
                videoUrl: videoUrl,
                audioUrl: audioUrl,
                reasoningText: reasoning_content,
                tool_calls: tool_calls,
                progress,
            };
            return record;
        })
            .reverse();
        return result;
    }
    async deleteChatLog(req, body) {
        const { id: userId } = req.user;
        const { id } = body;
        const c = await this.chatLogEntity.findOne({ where: { id, userId } });
        if (!c) {
            throw new common_1.HttpException('你删除的对话记录不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.chatLogEntity.update({ id }, { isDelete: true });
        if (r.affected > 0) {
            return '删除对话记录成功！';
        }
        else {
            throw new common_1.HttpException('你删除的对话记录不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async delByGroupId(req, body) {
        const { groupId } = body;
        const { id } = req.user;
        const g = await this.chatGroupEntity.findOne({
            where: { id: groupId, userId: id },
        });
        if (!g) {
            throw new common_1.HttpException('你删除的对话记录不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const r = await this.chatLogEntity.update({ groupId }, { isDelete: true });
        if (r.affected > 0) {
            return '删除对话记录成功！';
        }
        if (r.affected === 0) {
            throw new common_1.HttpException('当前页面已经没有东西可以删除了！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async deleteChatsAfterId(req, body) {
        const { id } = body;
        const { id: userId } = req.user;
        const chatLog = await this.chatLogEntity.findOne({ where: { id, userId } });
        if (!chatLog) {
            throw new common_1.HttpException('你删除的对话记录不存在、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { groupId } = chatLog;
        const result = await this.chatLogEntity.update({ groupId, id: (0, typeorm_2.MoreThanOrEqual)(id) }, { isDelete: true });
        if (result.affected > 0) {
            return '删除对话记录成功！';
        }
        else {
            throw new common_1.HttpException('当前页面已经没有东西可以删除了！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async byAppId(req, body) {
        const { id } = req.user;
        const { appId, page = 1, size = 10 } = body;
        const [rows, count] = await this.chatLogEntity.findAndCount({
            where: { userId: id, appId, role: 'assistant' },
            order: { id: 'DESC' },
            take: size,
            skip: (page - 1) * size,
        });
        return { rows, count };
    }
    async checkModelLimits(userId, model) {
        const ONE_HOUR_IN_MS = 3600 * 1000;
        const oneHourAgo = new Date(Date.now() - ONE_HOUR_IN_MS);
        try {
            const usageCount = await this.chatLogEntity.count({
                where: {
                    userId: userId.id,
                    model,
                    createdAt: (0, typeorm_2.MoreThan)(oneHourAgo),
                },
            });
            const adjustedUsageCount = Math.ceil(usageCount / 2);
            common_1.Logger.log(`用户ID: ${userId.id} 一小时内调用 ${model} 模型 ${adjustedUsageCount + 1} 次`, 'ChatLogService');
            let modelInfo;
            if (model.startsWith('gpt-4-gizmo')) {
                modelInfo = await this.modelsService.getCurrentModelKeyInfo('gpts');
            }
            else {
                modelInfo = await this.modelsService.getCurrentModelKeyInfo(model);
            }
            const modelLimits = Number(modelInfo.modelLimits);
            common_1.Logger.log(`模型 ${model} 的使用次数限制为 ${modelLimits}`, 'ChatLogService');
            if (adjustedUsageCount > modelLimits) {
                return true;
            }
            return false;
        }
        catch (error) {
            common_1.Logger.error(`查询数据库出错 - 用户ID: ${userId.id}, 模型: ${model}, 错误信息: ${error.message}`, error.stack, 'ChatLogService');
        }
    }
    async querySingleChat(req, params) {
        try {
            const { chatId } = params;
            if (!chatId) {
                return '请输入正确的聊天ID';
            }
            const chatLog = await this.chatLogEntity.findOne({
                where: { id: Number(chatId) },
            });
            if (!chatLog) {
                common_1.Logger.warn(`未找到ID为 ${chatId} 的消息记录`, 'ChatLogService');
                return '未找到该消息';
            }
            const formattedResult = {
                id: chatLog.id,
                action: chatLog.action || '',
                taskData: chatLog.taskData || '',
                chatId: chatLog.id,
                content: chatLog.content || (chatLog.role === 'assistant' ? chatLog.answer : chatLog.prompt) || '',
                reasoningText: chatLog.reasoning_content || '',
                tool_calls: chatLog.tool_calls || '',
                role: chatLog.role || 'assistant',
                status: chatLog.status || 0,
                model: chatLog.model || '',
                modelName: chatLog.modelName || '',
                modelType: chatLog.type || 1,
                imageUrl: chatLog.imageUrl || chatLog.fileInfo || '',
                fileUrl: chatLog.fileUrl || '',
                drawId: chatLog.drawId || '',
                customId: chatLog.customId || '',
                inversion: chatLog.role === 'user',
                createdAt: chatLog.createdAt,
                progress: chatLog.progress || 0,
                updatedAt: chatLog.updatedAt,
                ttsUrl: chatLog.ttsUrl || '',
                videoUrl: chatLog.videoUrl || '',
                audioUrl: chatLog.audioUrl || '',
                taskId: chatLog.taskId || '',
                promptReference: chatLog.promptReference || '',
                networkSearchResult: chatLog.networkSearchResult || '',
                fileVectorResult: chatLog.fileVectorResult || '',
                pluginParam: chatLog.pluginParam || '',
                modelAvatar: chatLog.modelAvatar || '',
            };
            return formattedResult;
        }
        catch (error) {
            common_1.Logger.error(`查询单条消息失败: ${error.message}`, error.stack, 'ChatLogService');
            return error.message;
        }
    }
};
exports.ChatLogService = ChatLogService;
exports.ChatLogService = ChatLogService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(chatLog_entity_1.ChatLogEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(chatGroup_entity_1.ChatGroupEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _c : Object, typeof (_d = typeof models_service_1.ModelsService !== "undefined" && models_service_1.ModelsService) === "function" ? _d : Object])
], ChatLogService);


/***/ }),
/* 158 */
/***/ ((module) => {

module.exports = require("exceljs");

/***/ }),
/* 159 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PluginEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let PluginEntity = class PluginEntity extends baseEntity_1.BaseEntity {
    name;
    pluginImg;
    description;
    isEnabled;
    parameters;
    sortOrder;
};
exports.PluginEntity = PluginEntity;
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: '插件名称' }),
    __metadata("design:type", String)
], PluginEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '插件封面', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], PluginEntity.prototype, "pluginImg", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '插件描述' }),
    __metadata("design:type", String)
], PluginEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '插件是否启用 0：禁用 1：启用', default: 1 }),
    __metadata("design:type", Number)
], PluginEntity.prototype, "isEnabled", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '调用参数', type: 'text' }),
    __metadata("design:type", String)
], PluginEntity.prototype, "parameters", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '排序值', default: 0 }),
    __metadata("design:type", Number)
], PluginEntity.prototype, "sortOrder", void 0);
exports.PluginEntity = PluginEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'plugin' })
], PluginEntity);


/***/ }),
/* 160 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UploadService = void 0;
const utils_1 = __webpack_require__(36);
const client_s3_1 = __webpack_require__(161);
const common_1 = __webpack_require__(2);
const ALIOSS = __webpack_require__(162);
const axios_1 = __webpack_require__(39);
const TENCENTCOS = __webpack_require__(163);
const FormData = __webpack_require__(164);
const fs_1 = __webpack_require__(18);
const mime = __webpack_require__(165);
const path = __webpack_require__(20);
const streamToBuffer = __webpack_require__(166);
const globalConfig_service_1 = __webpack_require__(74);
const redisCache_service_1 = __webpack_require__(28);
const blacklist = ['exe', 'sh', 'bat', 'js', 'php', 'py'];
let UploadService = class UploadService {
    globalConfigService;
    redisCacheService;
    constructor(globalConfigService, redisCacheService) {
        this.globalConfigService = globalConfigService;
        this.redisCacheService = redisCacheService;
    }
    tencentCos;
    onModuleInit() { }
    async checkUploadFrequency(userId) {
        const hourlyKey = `upload:frequency:${userId}:${new Date().getHours()}`;
        const uploadCount = await this.redisCacheService.get({ key: hourlyKey });
        const count = uploadCount ? parseInt(uploadCount) : 0;
        common_1.Logger.log(`用户${userId}当前小时上传次数: ${count}`, 'UploadService');
        if (count >= 100) {
            throw new common_1.HttpException('您的上传频率过高，请稍后再试', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        await this.redisCacheService.set({ key: hourlyKey, val: (count + 1).toString() }, 3600);
    }
    async uploadFile(file, dir = 'others', user = null) {
        if (user && user.id) {
            await this.checkUploadFrequency(user.id);
        }
        const { buffer, mimetype } = file;
        if (process.env.ISDEV === 'true') {
            dir = `dev/${dir}`;
        }
        const fileExtension = mime.extension(mimetype) || '';
        if (!fileExtension) {
            common_1.Logger.error('无法识别文件类型，请检查文件', 'UploadService');
        }
        if (blacklist.includes(fileExtension.toLowerCase())) {
            common_1.Logger.error('不允许上传此类型的文件', 'UploadService');
            throw new Error('不允许上传此类型的文件');
        }
        const now = new Date();
        const timestamp = now.getTime();
        const randomString = Math.random().toString(36).substring(2, 6);
        const filename = `${timestamp}_${randomString}.${fileExtension}`;
        const { tencentCosStatus = 0, aliOssStatus = 0, cheveretoStatus = 0, localStorageStatus = 0, s3Status = 0, } = await this.globalConfigService.getConfigs([
            'tencentCosStatus',
            'aliOssStatus',
            'cheveretoStatus',
            'localStorageStatus',
            's3Status',
        ]);
        common_1.Logger.log(`上传配置状态 - 本地存储: ${localStorageStatus}, S3: ${s3Status}, 腾讯云: ${tencentCosStatus}, 阿里云: ${aliOssStatus}, Chevereto: ${cheveretoStatus}`, 'UploadService');
        if (!Number(tencentCosStatus) &&
            !Number(aliOssStatus) &&
            !Number(cheveretoStatus) &&
            !Number(localStorageStatus) &&
            !Number(s3Status)) {
            common_1.Logger.error('未配置任何上传方式', 'UploadService');
            throw new common_1.HttpException('请先前往后台配置上传图片的方式', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            if (Number(localStorageStatus)) {
                common_1.Logger.log('使用本地存储上传文件', 'UploadService');
                const result = await this.uploadFileToLocal({ filename, buffer, dir });
                common_1.Logger.log(`文件已上传到本地存储。访问 URL: ${result}`, 'UploadService');
                return result;
            }
            if (Number(s3Status)) {
                common_1.Logger.log('使用 S3 上传文件', 'UploadService');
                const result = await this.uploadFileByS3({ filename, buffer, dir });
                common_1.Logger.log(`文件已上传到 S3。访问 URL: ${result}`, 'UploadService');
                return result;
            }
            if (Number(tencentCosStatus)) {
                common_1.Logger.log('使用腾讯云 COS 上传文件', 'UploadService');
                const result = await this.uploadFileByTencentCos({
                    filename,
                    buffer,
                    dir,
                });
                common_1.Logger.log(`文件已上传到腾讯云 COS。访问 URL: ${result}`, 'UploadService');
                return result;
            }
            if (Number(aliOssStatus)) {
                common_1.Logger.log('使用阿里云 OSS 上传文件', 'UploadService');
                const result = await this.uploadFileByAliOss({
                    filename,
                    buffer,
                    dir,
                });
                common_1.Logger.log(`文件已上传到阿里云 OSS。访问 URL: ${result}`, 'UploadService');
                return result;
            }
            if (Number(cheveretoStatus)) {
                common_1.Logger.log('使用 Chevereto 上传文件', 'UploadService');
                const result = await this.uploadFileByChevereto({
                    filename,
                    buffer: buffer.toString('base64'),
                });
                common_1.Logger.log(`文件已上传到 Chevereto。访问 URL: ${result}`, 'UploadService');
                return result;
            }
        }
        catch (error) {
            common_1.Logger.error(`上传失败: ${error.message}`, 'UploadService');
            throw error;
        }
    }
    async getUploadType() {
        const { tencentCosStatus = 0, aliOssStatus = 0, cheveretoStatus = 0, s3Status = 0, } = await this.globalConfigService.getConfigs([
            'tencentCosStatus',
            'aliOssStatus',
            'cheveretoStatus',
            's3Status',
        ]);
        if (Number(s3Status)) {
            return 's3';
        }
        if (Number(tencentCosStatus)) {
            return 'tencent';
        }
        if (Number(aliOssStatus)) {
            return 'ali';
        }
        if (Number(cheveretoStatus)) {
            return 'chevereto';
        }
    }
    async uploadFileFromUrl({ url, dir = 'others' }) {
        if (process.env.ISDEV === 'true') {
            dir = `dev/${dir}`;
        }
        const { buffer, mimeType } = await this.getBufferFromUrl(url);
        return await this.uploadFile({ buffer, mimetype: mimeType }, dir);
    }
    async uploadFileByTencentCos({ filename, buffer, dir }) {
        const { Bucket, Region, SecretId, SecretKey } = await this.getUploadConfig('tencent');
        this.tencentCos = new TENCENTCOS({
            SecretId,
            SecretKey,
            FileParallelLimit: 10,
        });
        try {
            return new Promise(async (resolve, reject) => {
                this.tencentCos.putObject({
                    Bucket: (0, utils_1.removeSpecialCharacters)(Bucket),
                    Region: (0, utils_1.removeSpecialCharacters)(Region),
                    Key: `${dir}/${filename}`,
                    StorageClass: 'STANDARD',
                    Body: buffer,
                }, async (err, data) => {
                    if (err) {
                        common_1.Logger.error(`腾讯云COS上传失败: ${err.message}`, 'UploadService');
                        return reject(err);
                    }
                    let locationUrl = data.Location.replace(/^(http:\/\/|https:\/\/|\/\/|)(.*)/, 'https://$2');
                    const { acceleratedDomain } = await this.getUploadConfig('tencent');
                    if (acceleratedDomain) {
                        locationUrl = locationUrl.replace(/^(https:\/\/[^/]+)(\/.*)$/, `https://${acceleratedDomain}$2`);
                        common_1.Logger.log(`腾讯云COS已开启全球加速: ${locationUrl}`, 'UploadService');
                    }
                    return resolve(locationUrl);
                });
            });
        }
        catch (error) {
            common_1.Logger.error(`腾讯云COS上传异常: ${error.message}`, 'UploadService');
            throw new common_1.HttpException('上传图片失败[ten]', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileByAliOss({ filename, buffer, dir }) {
        const { region, bucket, accessKeyId, accessKeySecret } = await this.getUploadConfig('ali');
        const client = new ALIOSS({
            region: (0, utils_1.removeSpecialCharacters)(region),
            accessKeyId,
            accessKeySecret,
            bucket: (0, utils_1.removeSpecialCharacters)(bucket),
            authorizationV4: true,
            secure: true,
        });
        try {
            common_1.Logger.log('阿里云OSS开始上传', 'UploadService');
            return new Promise((resolve, reject) => {
                client
                    .put(`${dir}/${filename}`, buffer)
                    .then(async (result) => {
                    const { acceleratedDomain } = await this.getUploadConfig('ali');
                    if (acceleratedDomain) {
                        result.url = result.url.replace(/^(https:\/\/[^/]+)(\/.*)$/, `https://${acceleratedDomain}$2`);
                        common_1.Logger.log(`阿里云OSS已开启全球加速: ${result.url}`, 'UploadService');
                    }
                    resolve(result.url);
                })
                    .catch(err => {
                    reject(err);
                });
            });
        }
        catch (error) {
            throw new common_1.HttpException('上传图片失败[ali]', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileByS3({ filename, buffer, dir }) {
        const { region, bucket, accessKeyId, secretAccessKey, endpoint, customDomain } = await this.getUploadConfig('s3');
        const s3Config = {
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        };
        if (region) {
            s3Config.region = (0, utils_1.removeSpecialCharacters)(region);
        }
        else {
            s3Config.region = 'us-east-1';
        }
        if (endpoint) {
            s3Config.endpoint = endpoint;
            s3Config.forcePathStyle = true;
        }
        const s3Client = new client_s3_1.S3Client(s3Config);
        try {
            common_1.Logger.log(`S3 开始上传 - 区域: ${s3Config.region}, 存储桶: ${bucket}, 端点: ${endpoint || '默认'}`, 'UploadService');
            const command = new client_s3_1.PutObjectCommand({
                Bucket: (0, utils_1.removeSpecialCharacters)(bucket),
                Key: `${dir}/${filename}`,
                Body: buffer,
                ContentType: mime.lookup(filename) || 'application/octet-stream',
            });
            const result = await s3Client.send(command);
            let fileUrl;
            if (customDomain) {
                fileUrl = `https://${customDomain}/${dir}/${filename}`;
            }
            else if (endpoint) {
                const endpointUrl = endpoint.replace(/^https?:\/\//, '');
                fileUrl = `https://${endpointUrl}/${bucket}/${dir}/${filename}`;
            }
            else if (region) {
                fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${dir}/${filename}`;
            }
            else {
                fileUrl = `https://${bucket}.s3.amazonaws.com/${dir}/${filename}`;
            }
            common_1.Logger.log(`S3上传成功: ${fileUrl}`, 'UploadService');
            return fileUrl;
        }
        catch (error) {
            common_1.Logger.error(`S3上传失败: ${error.message}`, 'UploadService');
            common_1.Logger.error(`S3配置详情 - 区域: ${s3Config.region}, 存储桶: ${bucket}, 端点: ${endpoint || '默认'}, 访问密钥: ${accessKeyId ? '已设置' : '未设置'}`, 'UploadService');
            throw new common_1.HttpException(`上传文件失败[S3]: ${error.message}`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileToLocal({ filename, buffer, dir = 'others' }) {
        const normalizedDir = path.normalize(dir).replace(/^(\.\.(\/|\\|$))+/, '');
        const normalizedFilename = path.basename(filename);
        const projectRoot = process.cwd();
        const uploadDir = path.join(projectRoot, 'public', 'file', normalizedDir);
        const filePath = path.join(uploadDir, normalizedFilename);
        if (!filePath.startsWith(path.join(projectRoot, 'public', 'file'))) {
            throw new Error('非法路径，禁止访问目录之外的位置');
        }
        try {
            await fs_1.promises.mkdir(uploadDir, { recursive: true });
        }
        catch (err) {
            common_1.Logger.error(`创建目录失败: ${uploadDir}`, err);
            throw err;
        }
        try {
            await fs_1.promises.writeFile(filePath, buffer, { mode: 0o444 });
        }
        catch (err) {
            common_1.Logger.error(`文件保存失败: ${filePath}`, err);
            throw err;
        }
        let fileUrl = `file/${normalizedDir}/${normalizedFilename}`;
        const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
        if (siteUrl) {
            const url = (0, utils_1.formatUrl)(siteUrl);
            fileUrl = `${url}/${fileUrl}`;
        }
        return fileUrl;
    }
    async uploadFileByChevereto({ filename = '', buffer }) {
        const { key, uploadPath } = await this.getUploadConfig('chevereto');
        const url = uploadPath.endsWith('/') ? uploadPath.slice(0, -1) : uploadPath;
        const formData = new FormData();
        const fromBuffer = buffer.toString('base64');
        formData.append('source', fromBuffer);
        formData.append('key', key);
        formData.append('title', filename);
        try {
            const res = await axios_1.default.post(url, formData, {
                headers: { 'X-API-Key': key },
            });
            if (res?.status === 200) {
                return res.data.image.url;
            }
            else {
                common_1.Logger.error(`Chevereto上传失败 - 状态码: ${res?.data.code}, 错误信息: ${res?.data.error.message}`, 'UploadService');
                common_1.Logger.error('上传图片失败[Chevereto]', JSON.stringify(res.data));
            }
        }
        catch (error) {
            common_1.Logger.error(`Chevereto上传异常: ${error.message}`, 'UploadService');
            throw new common_1.HttpException(`上传图片失败[Chevereto|buffer] --> ${error.response?.data.error.message}`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getUploadConfig(type) {
        if (type === 'ali') {
            const { aliOssRegion: region, aliOssBucket: bucket, aliOssAccessKeyId: accessKeyId, aliOssAccessKeySecret: accessKeySecret, aliOssAcceleratedDomain: acceleratedDomain, } = await this.globalConfigService.getConfigs([
                'aliOssRegion',
                'aliOssBucket',
                'aliOssAccessKeyId',
                'aliOssAccessKeySecret',
                'aliOssAcceleratedDomain',
            ]);
            return {
                region,
                bucket,
                accessKeyId,
                accessKeySecret,
                acceleratedDomain,
            };
        }
        if (type === 'tencent') {
            const { cosBucket: Bucket, cosRegion: Region, cosSecretId: SecretId, cosSecretKey: SecretKey, tencentCosAcceleratedDomain: acceleratedDomain, } = await this.globalConfigService.getConfigs([
                'cosBucket',
                'cosRegion',
                'cosSecretId',
                'cosSecretKey',
                'tencentCosAcceleratedDomain',
            ]);
            return { Bucket, Region, SecretId, SecretKey, acceleratedDomain };
        }
        if (type === 's3') {
            const { s3Region: region, s3Bucket: bucket, s3AccessKeyId: accessKeyId, s3SecretAccessKey: secretAccessKey, s3Endpoint: endpoint, s3CustomDomain: customDomain, } = await this.globalConfigService.getConfigs([
                's3Region',
                's3Bucket',
                's3AccessKeyId',
                's3SecretAccessKey',
                's3Endpoint',
                's3CustomDomain',
            ]);
            return { region, bucket, accessKeyId, secretAccessKey, endpoint, customDomain };
        }
        if (type === 'chevereto') {
            const { cheveretoKey: key, cheveretoUploadPath: uploadPath } = await this.globalConfigService.getConfigs(['cheveretoKey', 'cheveretoUploadPath']);
            return { key, uploadPath };
        }
    }
    async getBufferFromUrl(url) {
        const response = await axios_1.default.get(url, { responseType: 'stream' });
        const buffer = await new Promise((resolve, reject) => {
            streamToBuffer(response.data, (err, buffer) => {
                if (err) {
                    reject(new common_1.HttpException('获取图片资源失败，请重新试试吧！', common_1.HttpStatus.BAD_REQUEST));
                }
                else {
                    resolve(buffer);
                }
            });
        });
        const mimeType = response.headers['content-type'];
        return { buffer, mimeType };
    }
};
exports.UploadService = UploadService;
exports.UploadService = UploadService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _a : Object, typeof (_b = typeof redisCache_service_1.RedisCacheService !== "undefined" && redisCache_service_1.RedisCacheService) === "function" ? _b : Object])
], UploadService);


/***/ }),
/* 161 */
/***/ ((module) => {

module.exports = require("@aws-sdk/client-s3");

/***/ }),
/* 162 */
/***/ ((module) => {

module.exports = require("ali-oss");

/***/ }),
/* 163 */
/***/ ((module) => {

module.exports = require("cos-nodejs-sdk-v5");

/***/ }),
/* 164 */
/***/ ((module) => {

module.exports = require("form-data");

/***/ }),
/* 165 */
/***/ ((module) => {

module.exports = require("mime-types");

/***/ }),
/* 166 */
/***/ ((module) => {

module.exports = require("stream-to-buffer");

/***/ }),
/* 167 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatController = void 0;
const swagger_1 = __webpack_require__(14);
const jwtAuth_guard_1 = __webpack_require__(87);
const chat_service_1 = __webpack_require__(168);
const common_1 = __webpack_require__(2);
const express_1 = __webpack_require__(104);
const chatProcess_dto_1 = __webpack_require__(169);
let ChatController = class ChatController {
    chatService;
    constructor(chatService) {
        this.chatService = chatService;
    }
    chatProcess(body, req, res) {
        return this.chatService.chatProcess(body, req, res);
    }
    ttsProcess(body, req, res) {
        return this.chatService.ttsProcess(body, req, res);
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Post)('chat-process'),
    (0, swagger_1.ApiOperation)({ summary: 'gpt聊天对话' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof chatProcess_dto_1.ChatProcessDto !== "undefined" && chatProcess_dto_1.ChatProcessDto) === "function" ? _b : Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object, typeof (_d = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "chatProcess", null);
__decorate([
    (0, common_1.Post)('tts-process'),
    (0, swagger_1.ApiOperation)({ summary: 'tts语音播报' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object, typeof (_f = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "ttsProcess", null);
exports.ChatController = ChatController = __decorate([
    (0, swagger_1.ApiTags)('chatgpt'),
    (0, common_1.Controller)('chatgpt'),
    __metadata("design:paramtypes", [typeof (_a = typeof chat_service_1.ChatService !== "undefined" && chat_service_1.ChatService) === "function" ? _a : Object])
], ChatController);


/***/ }),
/* 168 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatService = void 0;
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const openai_1 = __webpack_require__(153);
const typeorm_2 = __webpack_require__(3);
const chat_service_1 = __webpack_require__(152);
const app_entity_1 = __webpack_require__(106);
const app_service_1 = __webpack_require__(105);
const autoReply_service_1 = __webpack_require__(135);
const badWords_service_1 = __webpack_require__(143);
const chatGroup_service_1 = __webpack_require__(155);
const chatLog_service_1 = __webpack_require__(157);
const globalConfig_service_1 = __webpack_require__(74);
const models_service_1 = __webpack_require__(76);
const plugin_entity_1 = __webpack_require__(159);
const upload_service_1 = __webpack_require__(160);
const user_service_1 = __webpack_require__(97);
const userBalance_service_1 = __webpack_require__(34);
let ChatService = class ChatService {
    appEntity;
    pluginEntity;
    openAIChatService;
    chatLogService;
    userBalanceService;
    userService;
    uploadService;
    badWordsService;
    autoReplyService;
    globalConfigService;
    chatGroupService;
    modelsService;
    appService;
    constructor(appEntity, pluginEntity, openAIChatService, chatLogService, userBalanceService, userService, uploadService, badWordsService, autoReplyService, globalConfigService, chatGroupService, modelsService, appService) {
        this.appEntity = appEntity;
        this.pluginEntity = pluginEntity;
        this.openAIChatService = openAIChatService;
        this.chatLogService = chatLogService;
        this.userBalanceService = userBalanceService;
        this.userService = userService;
        this.uploadService = uploadService;
        this.badWordsService = badWordsService;
        this.autoReplyService = autoReplyService;
        this.globalConfigService = globalConfigService;
        this.chatGroupService = chatGroupService;
        this.modelsService = modelsService;
        this.appService = appService;
    }
    async chatProcess(body, req, res) {
        await this.userBalanceService.checkUserCertification(req.user.id);
        const { options = {}, usingPluginId, appId = null, prompt, fileUrl, imageUrl, extraParam, model, action, modelName, modelAvatar, } = body;
        common_1.Logger.debug(`body: ${JSON.stringify(body)}`, 'ChatService');
        let appInfo;
        if (appId) {
            common_1.Logger.debug(`正在使用应用ID: ${appId}`);
            appInfo = await this.appEntity.findOne({
                where: { id: appId, status: (0, typeorm_2.In)([1, 3, 4, 5]) },
            });
            if (!appInfo) {
                throw new common_1.HttpException('你当前使用的应用已被下架、请删除当前对话开启新的对话吧！', common_1.HttpStatus.BAD_REQUEST);
            }
            const isAppMemberOnly = await this.appService.checkAppIsMemberOnly(Number(appId));
            if (isAppMemberOnly) {
                common_1.Logger.debug(`检测到会员专属应用: ${isAppMemberOnly}`);
                const userCatIds = await this.userBalanceService.getUserApps(req.user.id);
                common_1.Logger.debug(`用户权限分类: ${userCatIds.join(',')}`);
                const appCatIds = appInfo.catId.split(',').map(id => id.trim());
                common_1.Logger.debug(`应用所属分类: ${appCatIds.join(',')}`);
                const hasMatchingCategory = appCatIds.some(catId => userCatIds.includes(catId));
                if (!hasMatchingCategory) {
                    throw new common_1.HttpException('你当前使用的应用为会员专属应用，请先开通会员！', common_1.HttpStatus.PAYMENT_REQUIRED);
                }
            }
        }
        const { groupId, usingNetwork, usingDeepThinking, usingMcpTool } = options;
        const { openaiBaseUrl, openaiBaseKey, systemPreMessage, openaiTemperature, openaiBaseModel, isGeneratePromptReference, isConvertToBase64, isSensitiveWordFilter, } = await this.globalConfigService.getConfigs([
            'openaiBaseUrl',
            'openaiBaseKey',
            'systemPreMessage',
            'openaiTemperature',
            'openaiBaseModel',
            'isGeneratePromptReference',
            'isConvertToBase64',
            'isSensitiveWordFilter',
        ]);
        await this.userService.checkUserStatus(req.user);
        res && res.setHeader('Content-type', 'application/octet-stream; charset=utf-8');
        if (isSensitiveWordFilter === '1') {
            const triggeredWords = await this.badWordsService.checkBadWords(prompt, req.user.id);
            if (triggeredWords.length > 0) {
                const tips = `您提交的信息中包含违规的内容，我们已对您的账户进行标记，请合规使用！`;
                throw new common_1.HttpException(tips, common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const autoReplyRes = await this.autoReplyService.checkAutoReply(prompt);
        common_1.Logger.debug(`自动回复检查结果: ${JSON.stringify(autoReplyRes)}`, 'ChatService');
        let currentRequestModelKey = null;
        let appName = '';
        let setSystemMessage = '';
        res && res.status(200);
        const curIp = (0, utils_1.getClientIp)(req);
        let useModelAvatar = '';
        let usingPlugin;
        if (usingPluginId) {
            common_1.Logger.debug(`使用插件ID: ${usingPluginId}`, 'ChatService');
            if (usingPluginId === 999) {
                usingPlugin = {
                    parameters: 'mermaid',
                };
            }
        }
        if (appInfo) {
            const { isGPTs, gizmoID, name, isFixedModel, appModel, coverImg } = appInfo;
            useModelAvatar = coverImg;
            appName = name;
            if (isGPTs) {
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo('gpts');
                currentRequestModelKey.model = `gpt-4-gizmo-${gizmoID}`;
            }
            else if (!isGPTs && isFixedModel && appModel) {
                appInfo.preset && (setSystemMessage = appInfo.preset);
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(appModel);
                currentRequestModelKey.model = appModel;
                common_1.Logger.debug(`使用固定模型和应用预设`, 'ChatService');
            }
            else {
                appInfo.preset && (setSystemMessage = appInfo.preset);
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
                common_1.Logger.debug(`使用应用预设模式`, 'ChatService');
            }
        }
        else {
            if (usingPlugin?.parameters === 'mermaid') {
                setSystemMessage = `
{
"title": "Mermaid专业图表大师",
"description": "智能多类型Mermaid图表生成专家",

## 角色定位
你是一位精通Mermaid语法的专业图表设计师，具备将复杂信息转化为清晰可视化图表的卓越能力。你不仅掌握所有Mermaid图表类型，还能根据用户需求智能选择最优图表方案。

## 核心能力矩阵

### 流程与逻辑类
- **流程图(flowchart)**: 展示流程、决策和系统工作流
- **时序图(sequenceDiagram)**: 描述对象间的交互顺序
- **状态图(stateDiagram)**: 展示状态转换和生命周期
- **用户旅程图(journey)**: 可视化用户体验历程

### 结构与关系类
- **类图(classDiagram)**: UML类结构和继承关系
- **实体关系图(erDiagram)**: 数据库实体关系建模
- **C4图(C4Context等)**: 软件架构多层次视图
- **思维导图(mindmap)**: 思维结构和概念关联

### 时间与进度类
- **甘特图(gantt)**: 项目进度和时间规划
- **时间线图(timeline)**: 历史事件和里程碑
- **Gitgraph图(gitGraph)**: Git版本控制历史

### 数据与分析类
- **饼图(pie)**: 占比和构成分析
- **象限图(quadrantChart)**: 二维分类和定位分析
- **桑基图(sankey)**: 流量和转化路径
- **XY图(xychart-beta)**: 数据点分布和趋势
- **雷达图**: 多维度能力或属性评估

### 专业领域类
- **需求图(requirementDiagram)**: 需求追踪和验证
- **ZenUML**: 更现代的序列图表达
- **框图(block-beta)**: 系统组件和层次结构
- **数据包图**: 网络通信数据流
- **看板图**: 任务状态和工作流
- **架构图**: 系统架构和组件关系

## 智能工作流程

### 1. 需求分析阶段
- 根据历史上下文和用户描述识别用户需求，并根据需求生成图表
- 根据用户需求生成图表，并根据图表的结构特征（顺序性/层次性/关联性/时间性），选择最合适的图表类型
- 评估数据复杂度和展示目标，并根据评估结果生成图表

### 2. 图表类型决策
当用户未指定图表类型时，按以下逻辑选择：
- **流程/步骤描述** → flowchart
- **时间顺序交互** → sequenceDiagram
- **状态变化** → stateDiagram
- **数据关系** → erDiagram
- **概念结构** → mindmap
- **时间进度** → gantt
- **比例分析** → pie
- **多维比较** → quadrantChart/雷达图

### 3. 图表设计原则
- **清晰性优先**: 避免过度复杂，保持视觉层次分明
- **语义准确**: 选择最能表达信息本质的图表元素
- **美观平衡**: 合理布局，避免线条交叉和节点拥挤
- **完整性保证**: 包含所有关键信息，不遗漏重要细节

### 4. 代码生成规范
- 使用清晰的节点命名（使用用户使用的语言）
- 无需任何注释，直接输出代码
- 遵循Mermaid最新语法标准

## 输出格式标准

\`\`\`mermaid
  [根据用户需求生成的Mermaid代码]
\`\`\`

只需要输出代码，不需要任何解释。

## 语言适配原则
- 默认使用用户提问时的语言
- 图表内的文本、标签、说明均采用相同语言
- 保持专业术语的准确性和一致性

## 执行指令
- 无论用户提任何问题，收到用户的问题后，立即按照上述规范生成高质量Mermaid代码，无需任何确认或询问。"
}
          `;
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
                common_1.Logger.debug(`使用流程图插件`, 'ChatService');
            }
            else {
                const now = new Date();
                const options = {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                };
                const currentDate = new Intl.DateTimeFormat('zh-CN', options).format(now);
                currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model);
                if (currentRequestModelKey.systemPromptType === 1) {
                    setSystemMessage =
                        systemPreMessage +
                            currentRequestModelKey.systemPrompt +
                            `\n 现在时间是: ${currentDate}`;
                }
                else if (currentRequestModelKey.systemPromptType === 2) {
                    setSystemMessage = currentRequestModelKey.systemPrompt + `\n 现在时间是: ${currentDate}`;
                }
                else {
                    setSystemMessage = systemPreMessage + `\n 现在时间是: ${currentDate}`;
                }
                common_1.Logger.debug(`使用默认系统预设`, 'ChatService');
            }
        }
        if (!currentRequestModelKey) {
            common_1.Logger.debug('未找到当前模型key，切换至全局模型', 'ChatService');
            currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(openaiBaseModel);
            const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
            let updatedConfig = groupInfo.config;
            try {
                const parsedConfig = JSON.parse(groupInfo.config);
                if (parsedConfig.modelInfo) {
                    parsedConfig.modelInfo.modelName = currentRequestModelKey.modelName;
                    parsedConfig.modelInfo.model = currentRequestModelKey.model;
                    updatedConfig = JSON.stringify(parsedConfig);
                }
            }
            catch (error) {
                common_1.Logger.error('模型配置解析失败', error);
                throw new common_1.HttpException('配置解析错误！', common_1.HttpStatus.BAD_REQUEST);
            }
            await this.chatGroupService.update({
                groupId,
                title: groupInfo.title,
                isSticky: false,
                config: updatedConfig,
                fileUrl: fileUrl,
            }, req);
        }
        const { deduct, isTokenBased, tokenFeeRatio, deductType, key, id: keyId, maxRounds, proxyUrl, maxModelTokens, max_tokens, timeout, model: useModel, isFileUpload, isImageUpload, keyType: modelType, deductDeepThink = 1, isMcpTool, deepThinkingType, drawingType, } = currentRequestModelKey;
        if (await this.chatLogService.checkModelLimits(req.user, useModel)) {
            res.write(`\n${JSON.stringify({
                status: 3,
                content: '1 小时内对话次数过多，请切换模型或稍后再试！',
                modelType: modelType,
            })}`);
            res.end();
            return;
        }
        await this.userBalanceService.validateBalance(req, deductType, deduct * (usingDeepThinking ? deductDeepThink : 1));
        const useModeName = modelName;
        const proxyResUrl = (0, utils_1.formatUrl)(proxyUrl || openaiBaseUrl || 'https://api.openai.com');
        const modelKey = key || openaiBaseKey;
        const modelTimeout = (timeout || 300) * 1000;
        const temperature = Number(openaiTemperature) || 1;
        let promptReference = '';
        if (groupId) {
            const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId);
            this.updateChatTitle(groupId, groupInfo, modelType, prompt, req);
            await this.chatGroupService.updateTime(groupId);
        }
        const userSaveLog = await this.chatLogService.saveChatLog({
            appId: appId,
            curIp,
            userId: req.user.id,
            type: modelType ? modelType : 1,
            fileUrl: fileUrl ? fileUrl : null,
            imageUrl: imageUrl ? imageUrl : null,
            content: prompt,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            model: useModel,
            modelName: '我',
            role: 'user',
            groupId: groupId ? groupId : null,
        });
        const assistantSaveLog = await this.chatLogService.saveChatLog({
            appId: appId ? appId : null,
            action: action ? action : null,
            curIp,
            userId: req.user.id,
            type: modelType ? modelType : 1,
            progress: '0%',
            model: useModel,
            modelName: useModeName,
            role: 'assistant',
            groupId: groupId ? groupId : null,
            status: 2,
            modelAvatar: usingPlugin?.pluginImg || useModelAvatar || modelAvatar || '',
            pluginParam: usingPlugin?.parameters
                ? usingPlugin.parameters
                : modelType === 2
                    ? useModel
                    : null,
        });
        const userLogId = userSaveLog.id;
        const assistantLogId = assistantSaveLog.id;
        if (autoReplyRes.answer && res) {
            if (autoReplyRes.isAIReplyEnabled === 0) {
                const chars = autoReplyRes.answer.split('');
                const sendCharByChar = index => {
                    if (index < chars.length) {
                        const msg = { text: chars[index] };
                        res.write(`${JSON.stringify(msg)}\n`);
                        setTimeout(() => sendCharByChar(index + 1), 10);
                    }
                    else {
                        res.end();
                    }
                };
                sendCharByChar(0);
                await this.chatLogService.updateChatLog(assistantLogId, {
                    content: autoReplyRes.answer,
                });
                return;
            }
            else {
                setSystemMessage = setSystemMessage + autoReplyRes.answer;
            }
        }
        const { messagesHistory } = await this.buildMessageFromParentMessageId({
            groupId,
            systemMessage: setSystemMessage,
            maxModelTokens,
            maxRounds: maxRounds,
            isConvertToBase64: isConvertToBase64,
            fileUrl: fileUrl,
            imageUrl: imageUrl,
            model: useModel,
            isFileUpload,
            isImageUpload,
        }, this.chatLogService);
        let charge;
        if (action !== 'UPSCALE' && useModel === 'midjourney') {
            if (prompt.includes('--v 7')) {
                charge = deduct * 8;
            }
            else if (prompt.includes('--draft')) {
                charge = deduct * 2;
            }
            else {
                charge = deduct * 4;
            }
        }
        else {
            charge = deduct * (usingDeepThinking ? deductDeepThink : 1);
        }
        const abortController = new AbortController();
        try {
            if (res) {
                res.on('close', () => {
                    abortController.abort();
                });
                let response;
                try {
                    let chatId = {
                        chatId: assistantLogId,
                    };
                    res.write(`\n${JSON.stringify(chatId)}`);
                    response = await this.openAIChatService.chat(messagesHistory, {
                        chatId: assistantLogId,
                        extraParam,
                        deepThinkingType,
                        max_tokens: max_tokens,
                        apiKey: modelKey,
                        model: useModel,
                        modelName: useModeName,
                        temperature,
                        isImageUpload,
                        prompt,
                        imageUrl,
                        isFileUpload,
                        fileUrl,
                        usingNetwork,
                        timeout: modelTimeout,
                        proxyUrl: proxyResUrl,
                        modelAvatar: modelAvatar,
                        usingDeepThinking: usingDeepThinking,
                        usingMcpTool: usingMcpTool,
                        isMcpTool: isMcpTool,
                        onProgress: chat => {
                            res.write(`\n${JSON.stringify(chat)}`);
                        },
                        onFailure: async (data) => {
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                content: data.errMsg,
                                status: 4,
                            });
                        },
                        onDatabase: async (data) => {
                            if (data.networkSearchResult) {
                                await this.chatLogService.updateChatLog(assistantLogId, {
                                    networkSearchResult: data.networkSearchResult,
                                });
                            }
                            if (data.fileVectorResult) {
                                await this.chatLogService.updateChatLog(assistantLogId, {
                                    fileVectorResult: data.fileVectorResult,
                                });
                            }
                        },
                        abortController,
                    });
                    common_1.Logger.debug(`JSON: ${JSON.stringify(response)}`, 'ChatService');
                    if (response.errMsg) {
                        common_1.Logger.error(`用户ID: ${req.user.id} 模型名称: ${useModeName} 模型: ${model} 回复出错，本次不扣除积分`, 'ChatService');
                        return res.write(`\n${JSON.stringify(response)}`);
                    }
                    let totalText = '';
                    messagesHistory.forEach(messagesHistory => {
                        totalText += messagesHistory.content + ' ';
                    });
                    const promptTokens = await (0, utils_1.getTokenCount)(totalText);
                    const completionTokens = await (0, utils_1.getTokenCount)(response.full_reasoning_content + response.full_content);
                    await this.chatLogService.updateChatLog(userLogId, {
                        promptTokens: promptTokens,
                        completionTokens: completionTokens,
                        totalTokens: promptTokens + completionTokens,
                    });
                    let sanitizedAnswer = response.full_content;
                    if (isSensitiveWordFilter === '1') {
                        const triggeredWords = await this.badWordsService.checkBadWords(response.full_content, req.user.id);
                        if (triggeredWords.length > 0) {
                            const regex = new RegExp(triggeredWords.join('|'), 'gi');
                            sanitizedAnswer = sanitizedAnswer.replace(regex, matched => '*'.repeat(matched.length));
                            common_1.Logger.debug(`检测到敏感词，已进行屏蔽处理`, 'ChatService');
                        }
                    }
                    await this.chatLogService.updateChatLog(assistantLogId, {
                        content: sanitizedAnswer,
                        reasoning_content: response.full_reasoning_content,
                        tool_calls: response.tool_calls,
                        promptTokens: promptTokens,
                        completionTokens: completionTokens,
                        totalTokens: promptTokens + completionTokens,
                        status: 3,
                    });
                    try {
                        if (isGeneratePromptReference === '1') {
                            promptReference = await this.openAIChatService.chatFree(`根据用户提问{${prompt}}以及AI的回答{${response.full_content}}，生成三个更进入一步的问题来向AI提问，用{}包裹每个问题，不需要分行，不需要其他任何内容，单个提问不超过30个字`);
                            await this.chatLogService.updateChatLog(assistantLogId, {
                                promptReference: promptReference,
                            });
                            common_1.Logger.debug(`生成了相关问题推荐`, 'ChatService');
                        }
                    }
                    catch (error) {
                        common_1.Logger.debug(`生成相关问题推荐失败: ${error}`);
                    }
                    if (isTokenBased === true) {
                        charge =
                            deduct *
                                Math.ceil((promptTokens + completionTokens) / tokenFeeRatio) *
                                (usingDeepThinking ? deductDeepThink : 1);
                    }
                    await this.userBalanceService.deductFromBalance(req.user.id, deductType, charge, promptTokens + completionTokens);
                    await this.modelsService.saveUseLog(keyId, promptTokens + completionTokens);
                    common_1.Logger.log(`对话完成 - 用户: ${req.user.id}, 模型: ${useModeName}(${model}), Token: ${promptTokens + completionTokens}, 积分: ${charge}`, 'ChatService');
                    const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
                    response.userBalance = userBalance;
                    response.chatId = assistantLogId;
                    response.promptReference = promptReference;
                    return res.write(`\n${JSON.stringify(response)}`);
                }
                catch (error) {
                    common_1.Logger.error('处理请求出错:', error);
                    await this.chatLogService.updateChatLog(assistantLogId, {
                        status: 5,
                    });
                    response = { error: '处理请求时发生错误' };
                }
            }
        }
        catch (error) {
            common_1.Logger.error('聊天处理全局错误', error);
            if (res) {
                return res.write('发生未知错误，请稍后再试');
            }
            else {
                throw new common_1.HttpException('发生未知错误，请稍后再试', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        finally {
            res && res.end();
        }
    }
    async updateChatTitle(groupId, groupInfo, modelType, prompt, req) {
        if (groupInfo?.title === '新对话') {
            let chatTitle;
            if (modelType === 1) {
                try {
                    chatTitle = await this.openAIChatService.chatFree(`根据用户提问{${prompt}}，给这个对话取一个名字，不超过10个字，只需要返回标题，不需要其他任何内容。`);
                    if (chatTitle.length > 15) {
                        chatTitle = chatTitle.slice(0, 15);
                    }
                    common_1.Logger.debug(`已生成对话标题: ${chatTitle}`);
                }
                catch (error) {
                    common_1.Logger.debug(`标题生成失败，使用提问片段作为标题`);
                    chatTitle = prompt.slice(0, 10);
                }
            }
            else {
                chatTitle = '创意 AI';
            }
            this.chatGroupService
                .update({
                groupId,
                title: chatTitle,
            }, req)
                .then(() => common_1.Logger.debug(`更新对话标题: ${chatTitle}`))
                .catch(error => common_1.Logger.error(`更新对话标题失败`, error));
        }
    }
    async buildMessageFromParentMessageId(options, chatLogService) {
        const startTime = Date.now();
        let { systemMessage = '', maxRounds = 12, maxModelTokens = 64000, isFileUpload = 0, isImageUpload = 0, isConvertToBase64, groupId, } = options;
        const messages = [];
        if (groupId) {
            try {
                const history = await chatLogService.chatHistory(groupId, maxRounds);
                history.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                let userMessages = [];
                let assistantMessages = [];
                for (const record of history) {
                    try {
                        let content;
                        content = record.content || '';
                        let hasSpecialFormat = false;
                        if (isFileUpload === 1 && record.fileUrl) {
                            try {
                                const filesInfo = JSON.parse(record.fileUrl);
                                if (Array.isArray(filesInfo)) {
                                    const fileUrls = filesInfo.map(file => file.url).join('\n');
                                    content = fileUrls + '\n' + content;
                                }
                                else {
                                    content = record.fileUrl + '\n' + content;
                                }
                            }
                            catch (error) {
                                content = record.fileUrl + '\n' + content;
                                common_1.Logger.debug(`解析fileUrl失败，使用原始格式: ${error.message}`, 'ChatService');
                            }
                        }
                        if (isImageUpload === 2 && record.imageUrl) {
                            hasSpecialFormat = true;
                            const imageContent = await Promise.all(record.imageUrl.split(',').map(async (url) => ({
                                type: 'image_url',
                                image_url: {
                                    url: isConvertToBase64 === '1' ? await (0, utils_1.convertUrlToBase64)(url.trim()) : url.trim(),
                                },
                            })));
                            content = [{ type: 'text', text: content }, ...imageContent];
                        }
                        else if (isImageUpload === 1 && record.imageUrl) {
                            content = record.imageUrl + '\n' + content;
                        }
                        if (record.role === 'assistant') {
                            content = (0, utils_1.removeThinkTags)(content);
                            if (typeof content === 'string' && !content.trim()) {
                                continue;
                            }
                            assistantMessages.push({
                                id: record.id,
                                role: 'assistant',
                                content: content,
                                createdAt: record.createdAt,
                            });
                        }
                        else if (record.role === 'user') {
                            userMessages.push({
                                id: record.id,
                                role: 'user',
                                content: content,
                                createdAt: record.createdAt,
                            });
                        }
                    }
                    catch (error) {
                        common_1.Logger.debug(`处理历史记录ID=${record.id}失败: ${error.message}`, 'ChatService');
                    }
                }
                if (systemMessage) {
                    messages.push({ role: 'system', content: systemMessage });
                }
                userMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                assistantMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                const pairCount = Math.min(userMessages.length, assistantMessages.length);
                for (let i = 0; i < pairCount; i++) {
                    messages.push({ role: 'user', content: userMessages[i].content });
                    messages.push({ role: 'assistant', content: assistantMessages[i].content });
                }
                if (userMessages.length > pairCount) {
                    messages.push({ role: 'user', content: userMessages[userMessages.length - 1].content });
                }
            }
            catch (error) {
                common_1.Logger.error(`获取聊天历史记录失败: ${error.message}`, 'ChatService');
            }
        }
        let totalTokens = await (0, utils_1.getTokenCount)(messages);
        const tokenLimit = maxModelTokens < 8000 ? 4000 : maxModelTokens - 4000;
        if (totalTokens > tokenLimit) {
            common_1.Logger.debug(`消息超出token限制(${totalTokens} > ${tokenLimit})，开始裁剪`, 'ChatService');
            let trimIteration = 0;
            while (totalTokens > tokenLimit && messages.length > 2) {
                trimIteration++;
                if (messages.length === 2 &&
                    ((messages[0].role === 'system' && messages[1].role === 'user') ||
                        (messages[0].role === 'user' && messages[1].role === 'user'))) {
                    break;
                }
                const systemIndex = messages.findIndex(m => m.role === 'system');
                const lastUserIndex = messages.length - 1;
                if (messages.length > 2) {
                    const startIndex = systemIndex === 0 ? 1 : 0;
                    if (startIndex < lastUserIndex) {
                        if (messages[startIndex].role === 'user' &&
                            startIndex + 1 < lastUserIndex &&
                            messages[startIndex + 1].role === 'assistant') {
                            messages.splice(startIndex, 2);
                        }
                        else {
                            messages.splice(startIndex, 1);
                        }
                    }
                }
                const newTotalTokens = await (0, utils_1.getTokenCount)(messages);
                if (newTotalTokens >= totalTokens) {
                    common_1.Logger.debug('Token裁剪无效，停止裁剪过程');
                    break;
                }
                totalTokens = newTotalTokens;
            }
        }
        if (messages.length > 1) {
            const fixedMessages = [];
            if (messages[0].role === 'system') {
                fixedMessages.push(messages[0]);
                messages.shift();
            }
            const userMessages = messages
                .filter(msg => msg.role === 'user')
                .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
            const assistantMessages = messages
                .filter(msg => msg.role === 'assistant')
                .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
            const pairCount = Math.min(userMessages.length, assistantMessages.length);
            for (let i = 0; i < pairCount; i++) {
                fixedMessages.push(userMessages[i]);
                fixedMessages.push(assistantMessages[i]);
            }
            if (userMessages.length > pairCount) {
                fixedMessages.push(userMessages[userMessages.length - 1]);
            }
            messages.length = 0;
            messages.push(...fixedMessages);
        }
        common_1.Logger.debug(`构建消息历史完成: ${Math.floor(messages.length / 2)} 组对话, ${totalTokens} tokens, 耗时: ${Date.now() - startTime}ms`, 'ChatService');
        common_1.Logger.debug(`messages: ${JSON.stringify(messages)}`, 'ChatService');
        return {
            messagesHistory: messages,
            round: messages.length,
        };
    }
    async ttsProcess(body, req, res) {
        const { chatId, prompt } = body;
        const detailKeyInfo = await this.modelsService.getCurrentModelKeyInfo('tts-1');
        const { openaiBaseUrl, openaiBaseKey, openaiVoice } = await this.globalConfigService.getConfigs(['openaiBaseUrl', 'openaiBaseKey', 'openaiVoice']);
        const { key, proxyUrl, deduct, deductType, timeout } = detailKeyInfo;
        const useKey = key || openaiBaseKey;
        const useTimeout = timeout * 1000;
        await this.userBalanceService.validateBalance(req, deductType, deduct);
        common_1.Logger.debug(`开始TTS处理: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`, 'TTSService');
        try {
            const formattedUrl = (0, utils_1.formatUrl)(proxyUrl || openaiBaseUrl);
            const correctedProxyUrl = await (0, utils_1.correctApiBaseUrl)(formattedUrl);
            const openai = new openai_1.OpenAI({
                apiKey: useKey,
                baseURL: correctedProxyUrl,
                timeout: useTimeout,
            });
            const response = await openai.audio.speech.create({
                model: 'tts-1',
                input: prompt,
                voice: openaiVoice || 'onyx',
            });
            const buffer = Buffer.from(await response.arrayBuffer());
            common_1.Logger.debug('TTS音频数据生成成功', 'TTSService');
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const currentDate = `${year}${month}/${day}`;
            const ttsUrl = await this.uploadService.uploadFile({ buffer, mimetype: 'audio/mpeg' }, `audio/openai/${currentDate}`);
            await Promise.all([
                this.chatLogService.updateChatLog(chatId, { ttsUrl }),
                this.userBalanceService.deductFromBalance(req.user.id, deductType, deduct),
            ]);
            res.status(200).send({ ttsUrl });
        }
        catch (error) {
            common_1.Logger.error('TTS处理失败', error, 'TTSService');
            res.status(500).send({ error: '语音合成请求处理失败' });
        }
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(app_entity_1.AppEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(plugin_entity_1.PluginEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof chat_service_1.OpenAIChatService !== "undefined" && chat_service_1.OpenAIChatService) === "function" ? _c : Object, typeof (_d = typeof chatLog_service_1.ChatLogService !== "undefined" && chatLog_service_1.ChatLogService) === "function" ? _d : Object, typeof (_e = typeof userBalance_service_1.UserBalanceService !== "undefined" && userBalance_service_1.UserBalanceService) === "function" ? _e : Object, typeof (_f = typeof user_service_1.UserService !== "undefined" && user_service_1.UserService) === "function" ? _f : Object, typeof (_g = typeof upload_service_1.UploadService !== "undefined" && upload_service_1.UploadService) === "function" ? _g : Object, typeof (_h = typeof badWords_service_1.BadWordsService !== "undefined" && badWords_service_1.BadWordsService) === "function" ? _h : Object, typeof (_j = typeof autoReply_service_1.AutoReplyService !== "undefined" && autoReply_service_1.AutoReplyService) === "function" ? _j : Object, typeof (_k = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _k : Object, typeof (_l = typeof chatGroup_service_1.ChatGroupService !== "undefined" && chatGroup_service_1.ChatGroupService) === "function" ? _l : Object, typeof (_m = typeof models_service_1.ModelsService !== "undefined" && models_service_1.ModelsService) === "function" ? _m : Object, typeof (_o = typeof app_service_1.AppService !== "undefined" && app_service_1.AppService) === "function" ? _o : Object])
], ChatService);


/***/ }),
/* 169 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatProcessDto = exports.Options = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
const class_transformer_1 = __webpack_require__(170);
class Options {
    parentMessageId;
    model;
    temperature;
    top_p;
    groupId;
}
exports.Options = Options;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Options.prototype, "parentMessageId", void 0);
class ChatProcessDto {
    prompt;
    url;
    options;
    systemMessage;
    appId;
    model;
}
exports.ChatProcessDto = ChatProcessDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'hello, Who are you', description: '对话信息' }),
    (0, class_validator_1.IsNotEmpty)({ message: '提问信息不能为空！' }),
    __metadata("design:type", String)
], ChatProcessDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'https://aiweb.com',
        description: '对话附带的链接',
        required: false,
    }),
    __metadata("design:type", String)
], ChatProcessDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '{ parentMessageId: 0 }',
        description: '上次对话信息',
        required: false,
    }),
    (0, class_transformer_1.Type)(() => Options),
    __metadata("design:type", Options)
], ChatProcessDto.prototype, "options", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: "You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully. Respond using markdown.",
        description: '系统预设信息',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ChatProcessDto.prototype, "systemMessage", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '应用id', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ChatProcessDto.prototype, "appId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'gpt-3.5-turbo',
        description: '使用模型',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ChatProcessDto.prototype, "model", void 0);


/***/ }),
/* 170 */
/***/ ((module) => {

module.exports = require("class-transformer");

/***/ }),
/* 171 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatGroupModule = void 0;
const common_1 = __webpack_require__(2);
const chatGroup_controller_1 = __webpack_require__(172);
const chatGroup_service_1 = __webpack_require__(155);
const typeorm_1 = __webpack_require__(33);
const chatGroup_entity_1 = __webpack_require__(82);
const app_entity_1 = __webpack_require__(106);
let ChatGroupModule = class ChatGroupModule {
};
exports.ChatGroupModule = ChatGroupModule;
exports.ChatGroupModule = ChatGroupModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([chatGroup_entity_1.ChatGroupEntity, app_entity_1.AppEntity])],
        controllers: [chatGroup_controller_1.ChatGroupController],
        providers: [chatGroup_service_1.ChatGroupService],
        exports: [chatGroup_service_1.ChatGroupService],
    })
], ChatGroupModule);


/***/ }),
/* 172 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatGroupController = void 0;
const swagger_1 = __webpack_require__(14);
const chatGroup_service_1 = __webpack_require__(155);
const common_1 = __webpack_require__(2);
const createGroup_dto_1 = __webpack_require__(173);
const express_1 = __webpack_require__(104);
const jwtAuth_guard_1 = __webpack_require__(87);
const delGroup_dto_1 = __webpack_require__(174);
const updateGroup_dto_1 = __webpack_require__(175);
let ChatGroupController = class ChatGroupController {
    chatGroupService;
    constructor(chatGroupService) {
        this.chatGroupService = chatGroupService;
    }
    create(body, req) {
        return this.chatGroupService.create(body, req);
    }
    query(req) {
        return this.chatGroupService.query(req);
    }
    update(body, req) {
        return this.chatGroupService.update(body, req);
    }
    del(body, req) {
        return this.chatGroupService.del(body, req);
    }
    delAll(req) {
        return this.chatGroupService.delAll(req);
    }
};
exports.ChatGroupController = ChatGroupController;
__decorate([
    (0, common_1.Post)('create'),
    (0, swagger_1.ApiOperation)({ summary: '创建对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof createGroup_dto_1.CreateGroupDto !== "undefined" && createGroup_dto_1.CreateGroupDto) === "function" ? _b : Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '查询对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "query", null);
__decorate([
    (0, common_1.Post)('update'),
    (0, swagger_1.ApiOperation)({ summary: '更新对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof updateGroup_dto_1.UpdateGroupDto !== "undefined" && updateGroup_dto_1.UpdateGroupDto) === "function" ? _e : Object, typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof delGroup_dto_1.DelGroupDto !== "undefined" && delGroup_dto_1.DelGroupDto) === "function" ? _g : Object, typeof (_h = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _h : Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "del", null);
__decorate([
    (0, common_1.Post)('delAll'),
    (0, swagger_1.ApiOperation)({ summary: '删除对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_j = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _j : Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "delAll", null);
exports.ChatGroupController = ChatGroupController = __decorate([
    (0, swagger_1.ApiTags)('group'),
    (0, common_1.Controller)('group'),
    __metadata("design:paramtypes", [typeof (_a = typeof chatGroup_service_1.ChatGroupService !== "undefined" && chatGroup_service_1.ChatGroupService) === "function" ? _a : Object])
], ChatGroupController);


/***/ }),
/* 173 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateGroupDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class CreateGroupDto {
    appId;
    modelConfig;
    params;
}
exports.CreateGroupDto = CreateGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '应用ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateGroupDto.prototype, "appId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '',
        description: '对话模型配置项序列化的字符串',
        required: false,
    }),
    __metadata("design:type", Object)
], CreateGroupDto.prototype, "modelConfig", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '',
        description: '对话组参数序列化的字符串',
        required: false,
    }),
    __metadata("design:type", String)
], CreateGroupDto.prototype, "params", void 0);


/***/ }),
/* 174 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DelGroupDto = void 0;
const swagger_1 = __webpack_require__(14);
class DelGroupDto {
    groupId;
}
exports.DelGroupDto = DelGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '对话分组ID', required: true }),
    __metadata("design:type", Number)
], DelGroupDto.prototype, "groupId", void 0);


/***/ }),
/* 175 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateGroupDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class UpdateGroupDto {
    groupId;
    title;
    isSticky;
    config;
}
exports.UpdateGroupDto = UpdateGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '修改的对话ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], UpdateGroupDto.prototype, "groupId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '对话组title', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateGroupDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '对话组是否置顶', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateGroupDto.prototype, "isSticky", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '',
        description: '对话模型配置项序列化的字符串',
        required: false,
    }),
    __metadata("design:type", String)
], UpdateGroupDto.prototype, "config", void 0);


/***/ }),
/* 176 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatLogModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const chatGroup_entity_1 = __webpack_require__(82);
const user_entity_1 = __webpack_require__(83);
const chatLog_controller_1 = __webpack_require__(177);
const chatLog_entity_1 = __webpack_require__(75);
const chatLog_service_1 = __webpack_require__(157);
let ChatLogModule = class ChatLogModule {
};
exports.ChatLogModule = ChatLogModule;
exports.ChatLogModule = ChatLogModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([chatLog_entity_1.ChatLogEntity, user_entity_1.UserEntity, chatGroup_entity_1.ChatGroupEntity])],
        controllers: [chatLog_controller_1.ChatLogController],
        providers: [chatLog_service_1.ChatLogService],
        exports: [chatLog_service_1.ChatLogService],
    })
], ChatLogModule);


/***/ }),
/* 177 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatLogController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const jwtAuth_guard_1 = __webpack_require__(87);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const chatLog_service_1 = __webpack_require__(157);
const chatList_dto_1 = __webpack_require__(178);
const del_dto_1 = __webpack_require__(179);
const delByGroup_dto_1 = __webpack_require__(180);
const exportExcelChatlog_dto_1 = __webpack_require__(181);
const queryAllChatLog_dto_1 = __webpack_require__(182);
const queryByAppId_dto_1 = __webpack_require__(183);
const queryMyChatLog_dto_1 = __webpack_require__(184);
const querySingleChat_dto_1 = __webpack_require__(185);
const recDrawImg_dto_1 = __webpack_require__(186);
let ChatLogController = class ChatLogController {
    chatLogService;
    constructor(chatLogService) {
        this.chatLogService = chatLogService;
    }
    querDrawLog(query, req) {
        return this.chatLogService.querDrawLog(req, query);
    }
    recDrawImg(body) {
        return this.chatLogService.recDrawImg(body);
    }
    queryAllChatLog(params, req) {
        return this.chatLogService.querAllChatLog(params, req);
    }
    exportExcel(body, res) {
        return this.chatLogService.exportExcel(body, res);
    }
    chatList(req, params) {
        return this.chatLogService.chatList(req, params);
    }
    del(req, body) {
        return this.chatLogService.deleteChatLog(req, body);
    }
    delByGroupId(req, body) {
        return this.chatLogService.delByGroupId(req, body);
    }
    deleteChatsAfterId(req, body) {
        return this.chatLogService.deleteChatsAfterId(req, body);
    }
    byAppId(req, params) {
        return this.chatLogService.byAppId(req, params);
    }
    querySingleChat(req, params) {
        return this.chatLogService.querySingleChat(req, params);
    }
};
exports.ChatLogController = ChatLogController;
__decorate([
    (0, common_1.Get)('draw'),
    (0, swagger_1.ApiOperation)({ summary: '查询我的绘制记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof queryMyChatLog_dto_1.QuerMyChatLogDto !== "undefined" && queryMyChatLog_dto_1.QuerMyChatLogDto) === "function" ? _b : Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "querDrawLog", null);
__decorate([
    (0, common_1.Post)('recDrawImg'),
    (0, swagger_1.ApiOperation)({ summary: '推荐此图片对外展示' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof recDrawImg_dto_1.recDrawImgDto !== "undefined" && recDrawImg_dto_1.recDrawImgDto) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "recDrawImg", null);
__decorate([
    (0, common_1.Get)('chatAll'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有的问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof queryAllChatLog_dto_1.QuerAllChatLogDto !== "undefined" && queryAllChatLog_dto_1.QuerAllChatLogDto) === "function" ? _e : Object, typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "queryAllChatLog", null);
__decorate([
    (0, common_1.Post)('exportExcel'),
    (0, swagger_1.ApiOperation)({ summary: '导出问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof exportExcelChatlog_dto_1.ExportExcelChatlogDto !== "undefined" && exportExcelChatlog_dto_1.ExportExcelChatlogDto) === "function" ? _g : Object, typeof (_h = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _h : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "exportExcel", null);
__decorate([
    (0, common_1.Get)('chatList'),
    (0, swagger_1.ApiOperation)({ summary: '查询我的问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_j = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _j : Object, typeof (_k = typeof chatList_dto_1.ChatListDto !== "undefined" && chatList_dto_1.ChatListDto) === "function" ? _k : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "chatList", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除我的问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_l = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _l : Object, typeof (_m = typeof del_dto_1.DelDto !== "undefined" && del_dto_1.DelDto) === "function" ? _m : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "del", null);
__decorate([
    (0, common_1.Post)('delByGroupId'),
    (0, swagger_1.ApiOperation)({ summary: '清空一组对话' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_o = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _o : Object, typeof (_p = typeof delByGroup_dto_1.DelByGroupDto !== "undefined" && delByGroup_dto_1.DelByGroupDto) === "function" ? _p : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "delByGroupId", null);
__decorate([
    (0, common_1.Post)('deleteChatsAfterId'),
    (0, swagger_1.ApiOperation)({ summary: '删除对话组中某条对话及其后的所有对话' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_q = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _q : Object, Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "deleteChatsAfterId", null);
__decorate([
    (0, common_1.Get)('byAppId'),
    (0, swagger_1.ApiOperation)({ summary: '查询某个应用的问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_r = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _r : Object, typeof (_s = typeof queryByAppId_dto_1.QueryByAppIdDto !== "undefined" && queryByAppId_dto_1.QueryByAppIdDto) === "function" ? _s : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "byAppId", null);
__decorate([
    (0, common_1.Get)('querySingleChat'),
    (0, swagger_1.ApiOperation)({ summary: '查询单条消息的状态和内容' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_t = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _t : Object, typeof (_u = typeof querySingleChat_dto_1.QuerySingleChatDto !== "undefined" && querySingleChat_dto_1.QuerySingleChatDto) === "function" ? _u : Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "querySingleChat", null);
exports.ChatLogController = ChatLogController = __decorate([
    (0, common_1.Controller)('chatLog'),
    (0, swagger_1.ApiTags)('chatLog'),
    __metadata("design:paramtypes", [typeof (_a = typeof chatLog_service_1.ChatLogService !== "undefined" && chatLog_service_1.ChatLogService) === "function" ? _a : Object])
], ChatLogController);


/***/ }),
/* 178 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChatListDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class ChatListDto {
    groupId;
}
exports.ChatListDto = ChatListDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '对话分组ID', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ChatListDto.prototype, "groupId", void 0);


/***/ }),
/* 179 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DelDto = void 0;
const swagger_1 = __webpack_require__(14);
class DelDto {
    id;
}
exports.DelDto = DelDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '对话Id', required: true }),
    __metadata("design:type", Number)
], DelDto.prototype, "id", void 0);


/***/ }),
/* 180 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DelByGroupDto = void 0;
const swagger_1 = __webpack_require__(14);
class DelByGroupDto {
    groupId;
}
exports.DelByGroupDto = DelByGroupDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '对话组Id', required: true }),
    __metadata("design:type", Number)
], DelByGroupDto.prototype, "groupId", void 0);


/***/ }),
/* 181 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ExportExcelChatlogDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class ExportExcelChatlogDto {
    page;
    size;
    prompt;
    email;
}
exports.ExportExcelChatlogDto = ExportExcelChatlogDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ExportExcelChatlogDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], ExportExcelChatlogDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '您好',
        description: '用户询问的问题',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExportExcelChatlogDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'aiweb@aiweb.com',
        description: '用户邮箱',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ExportExcelChatlogDto.prototype, "email", void 0);


/***/ }),
/* 182 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuerAllChatLogDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class QuerAllChatLogDto {
    page;
    size;
    userId;
    prompt;
    role;
    type;
    model;
}
exports.QuerAllChatLogDto = QuerAllChatLogDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllChatLogDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllChatLogDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 99, description: '对话的用户id', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllChatLogDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '您好',
        description: '用户询问的问题',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAllChatLogDto.prototype, "prompt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'user', description: '身份', required: false }),
    __metadata("design:type", String)
], QuerAllChatLogDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1', description: '类型', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAllChatLogDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'gpt-4o-mini', description: '模型', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAllChatLogDto.prototype, "model", void 0);


/***/ }),
/* 183 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryByAppIdDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QueryByAppIdDto {
    appId;
    page;
    size;
}
exports.QueryByAppIdDto = QueryByAppIdDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '应用Id', required: true }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryByAppIdDto.prototype, "appId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryByAppIdDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QueryByAppIdDto.prototype, "size", void 0);


/***/ }),
/* 184 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuerMyChatLogDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QuerMyChatLogDto {
    model;
}
exports.QuerMyChatLogDto = QuerMyChatLogDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'mj', description: '使用的模型', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerMyChatLogDto.prototype, "model", void 0);


/***/ }),
/* 185 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuerySingleChatDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class QuerySingleChatDto {
    chatId;
}
exports.QuerySingleChatDto = QuerySingleChatDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123', description: '聊天记录ID' }),
    (0, class_validator_1.IsNotEmpty)({ message: '聊天记录ID不能为空' }),
    __metadata("design:type", Number)
], QuerySingleChatDto.prototype, "chatId", void 0);


/***/ }),
/* 186 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.recDrawImgDto = void 0;
const swagger_1 = __webpack_require__(14);
class recDrawImgDto {
    id;
}
exports.recDrawImgDto = recDrawImgDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '推荐图片的id' }),
    __metadata("design:type", Number)
], recDrawImgDto.prototype, "id", void 0);


/***/ }),
/* 187 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CramiModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const chatGroup_entity_1 = __webpack_require__(82);
const chatLog_entity_1 = __webpack_require__(75);
const config_entity_1 = __webpack_require__(73);
const user_entity_1 = __webpack_require__(83);
const accountLog_entity_1 = __webpack_require__(79);
const balance_entity_1 = __webpack_require__(80);
const fingerprint_entity_1 = __webpack_require__(84);
const userBalance_entity_1 = __webpack_require__(81);
const userBalance_service_1 = __webpack_require__(34);
const crami_controller_1 = __webpack_require__(188);
const crami_entity_1 = __webpack_require__(190);
const crami_service_1 = __webpack_require__(189);
const cramiPackage_entity_1 = __webpack_require__(71);
let CramiModule = class CramiModule {
};
exports.CramiModule = CramiModule;
exports.CramiModule = CramiModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                crami_entity_1.CramiEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                user_entity_1.UserEntity,
                balance_entity_1.BalanceEntity,
                accountLog_entity_1.AccountLogEntity,
                config_entity_1.ConfigEntity,
                userBalance_entity_1.UserBalanceEntity,
                fingerprint_entity_1.FingerprintLogEntity,
                chatLog_entity_1.ChatLogEntity,
                chatGroup_entity_1.ChatGroupEntity,
            ]),
        ],
        providers: [crami_service_1.CramiService, userBalance_service_1.UserBalanceService],
        controllers: [crami_controller_1.CramiController],
        exports: [crami_service_1.CramiService],
    })
], CramiModule);


/***/ }),
/* 188 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CramiController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const jwtAuth_guard_1 = __webpack_require__(87);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const crami_service_1 = __webpack_require__(189);
const batchDelCrami_dto_1 = __webpack_require__(191);
const createCrami_dto_1 = __webpack_require__(192);
const createPackage_dto_1 = __webpack_require__(193);
const deletePackage_dto_1 = __webpack_require__(194);
const queryAllCrami_dto_1 = __webpack_require__(195);
const queryAllPackage_dto_1 = __webpack_require__(196);
const updatePackage_dto_1 = __webpack_require__(197);
const useCrami_dto_1 = __webpack_require__(198);
let CramiController = class CramiController {
    cramiService;
    constructor(cramiService) {
        this.cramiService = cramiService;
    }
    async queryOnePackage(id) {
        return this.cramiService.queryOnePackage(id);
    }
    async queryAllPackage(query) {
        return this.cramiService.queryAllPackage(query);
    }
    async createPackage(body) {
        return this.cramiService.createPackage(body);
    }
    async updatePackage(body) {
        return this.cramiService.updatePackage(body);
    }
    async delPackage(body) {
        return this.cramiService.delPackage(body);
    }
    async createCrami(body) {
        return this.cramiService.createCrami(body);
    }
    async useCrami(req, body) {
        return this.cramiService.useCrami(req, body);
    }
    async queryAllCrami(params, req) {
        return this.cramiService.queryAllCrami(params, req);
    }
    async delCrami(id) {
        return this.cramiService.delCrami(id);
    }
    async batchDelCrami(body) {
        return this.cramiService.batchDelCrami(body);
    }
};
exports.CramiController = CramiController;
__decorate([
    (0, common_1.Get)('queryOnePackage'),
    (0, swagger_1.ApiOperation)({ summary: '查询单个套餐' }),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "queryOnePackage", null);
__decorate([
    (0, common_1.Get)('queryAllPackage'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有套餐' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof queryAllPackage_dto_1.QuerAllPackageDto !== "undefined" && queryAllPackage_dto_1.QuerAllPackageDto) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "queryAllPackage", null);
__decorate([
    (0, common_1.Post)('createPackage'),
    (0, swagger_1.ApiOperation)({ summary: '创建套餐' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof createPackage_dto_1.CreatePackageDto !== "undefined" && createPackage_dto_1.CreatePackageDto) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "createPackage", null);
__decorate([
    (0, common_1.Post)('updatePackage'),
    (0, swagger_1.ApiOperation)({ summary: '更新套餐' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof updatePackage_dto_1.UpdatePackageDto !== "undefined" && updatePackage_dto_1.UpdatePackageDto) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "updatePackage", null);
__decorate([
    (0, common_1.Post)('delPackage'),
    (0, swagger_1.ApiOperation)({ summary: '删除套餐' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof deletePackage_dto_1.DeletePackageDto !== "undefined" && deletePackage_dto_1.DeletePackageDto) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "delPackage", null);
__decorate([
    (0, common_1.Post)('createCrami'),
    (0, swagger_1.ApiOperation)({ summary: '生成卡密' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof createCrami_dto_1.CreatCramiDto !== "undefined" && createCrami_dto_1.CreatCramiDto) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "createCrami", null);
__decorate([
    (0, common_1.Post)('useCrami'),
    (0, swagger_1.ApiOperation)({ summary: '使用卡密' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _g : Object, typeof (_h = typeof useCrami_dto_1.UseCramiDto !== "undefined" && useCrami_dto_1.UseCramiDto) === "function" ? _h : Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "useCrami", null);
__decorate([
    (0, common_1.Get)('queryAllCrami'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有卡密' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_j = typeof queryAllCrami_dto_1.QuerAllCramiDto !== "undefined" && queryAllCrami_dto_1.QuerAllCramiDto) === "function" ? _j : Object, typeof (_k = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _k : Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "queryAllCrami", null);
__decorate([
    (0, common_1.Post)('delCrami'),
    (0, swagger_1.ApiOperation)({ summary: '删除卡密' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "delCrami", null);
__decorate([
    (0, common_1.Post)('batchDelCrami'),
    (0, swagger_1.ApiOperation)({ summary: '批量删除卡密' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_l = typeof batchDelCrami_dto_1.BatchDelCramiDto !== "undefined" && batchDelCrami_dto_1.BatchDelCramiDto) === "function" ? _l : Object]),
    __metadata("design:returntype", Promise)
], CramiController.prototype, "batchDelCrami", null);
exports.CramiController = CramiController = __decorate([
    (0, swagger_1.ApiTags)('crami'),
    (0, common_1.Controller)('crami'),
    __metadata("design:paramtypes", [typeof (_a = typeof crami_service_1.CramiService !== "undefined" && crami_service_1.CramiService) === "function" ? _a : Object])
], CramiController);


/***/ }),
/* 189 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CramiService = void 0;
const balance_constant_1 = __webpack_require__(35);
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const user_entity_1 = __webpack_require__(83);
const userBalance_service_1 = __webpack_require__(34);
const crami_entity_1 = __webpack_require__(190);
const cramiPackage_entity_1 = __webpack_require__(71);
let CramiService = class CramiService {
    cramiEntity;
    cramiPackageEntity;
    userEntity;
    userBalanceService;
    constructor(cramiEntity, cramiPackageEntity, userEntity, userBalanceService) {
        this.cramiEntity = cramiEntity;
        this.cramiPackageEntity = cramiPackageEntity;
        this.userEntity = userEntity;
        this.userBalanceService = userBalanceService;
    }
    async queryOnePackage(id) {
        return await this.cramiPackageEntity.findOne({ where: { id } });
    }
    async queryAllPackage(query) {
        try {
            const { page = 1, size = 10, name, status, type } = query;
            const where = {};
            name && Object.assign(where, { name: (0, typeorm_2.Like)(`%${name}%`) });
            status && Object.assign(where, { status });
            if (type) {
                if (type > 0) {
                    Object.assign(where, { days: (0, typeorm_2.MoreThan)(0) });
                }
                else {
                    Object.assign(where, { days: (0, typeorm_2.LessThanOrEqual)(0) });
                }
            }
            const [rows, count] = await this.cramiPackageEntity.findAndCount({
                skip: (page - 1) * size,
                take: size,
                where,
                order: { order: 'DESC' },
            });
            return { rows, count };
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async createPackage(body) {
        const { name, weight } = body;
        const p = await this.cramiPackageEntity.findOne({
            where: [{ name }, { weight }],
        });
        if (p) {
            throw new common_1.HttpException('套餐名称或套餐等级重复、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            return await this.cramiPackageEntity.save(body);
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException(error, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async updatePackage(body) {
        const { id, name, weight } = body;
        const op = await this.cramiPackageEntity.findOne({ where: { id } });
        if (!op) {
            throw new common_1.HttpException('当前套餐不存在、请检查你的输入参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        const count = await this.cramiPackageEntity.count({
            where: [
                { name, id: (0, typeorm_2.Not)(id) },
                { weight, id: (0, typeorm_2.Not)(id) },
            ],
        });
        if (count) {
            throw new common_1.HttpException('套餐名称或套餐等级重复、请检查！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.cramiPackageEntity.update({ id }, body);
        if (res.affected > 0) {
            return '更新套餐成功！';
        }
        else {
            throw new common_1.HttpException('更新套餐失败、请重试！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async delPackage(body) {
        const { id } = body;
        const count = await this.cramiEntity.count({ where: { packageId: id } });
        if (count) {
            throw new common_1.HttpException('当前套餐下存在卡密、请先删除卡密后才可删除套餐！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.cramiPackageEntity.delete({ id });
    }
    async createCrami(body) {
        const { packageId, count = 1 } = body;
        if (packageId) {
            const pkg = await this.cramiPackageEntity.findOne({
                where: { id: packageId },
            });
            if (!pkg) {
                throw new common_1.HttpException('当前套餐不存在、请确认您选择的套餐是否存在！', common_1.HttpStatus.BAD_REQUEST);
            }
            const { days = -1, model3Count = 0, model4Count = 0, drawMjCount = 0, appCats = '' } = pkg;
            const baseCrami = {
                packageId,
                days,
                model3Count,
                model4Count,
                drawMjCount,
                appCats,
            };
            return await this.generateCrami(baseCrami, count);
        }
        if (!packageId) {
            const { model3Count = 0, model4Count = 0, drawMjCount = 0 } = body;
            if ([model3Count, model4Count, drawMjCount].every(v => !v)) {
                throw new common_1.HttpException('自定义卡密必须至少一项余额不为0️零！', common_1.HttpStatus.BAD_REQUEST);
            }
            const baseCrami = { days: -1, model3Count, model4Count, drawMjCount };
            return await this.generateCrami(baseCrami, count);
        }
    }
    async generateCrami(cramiInfo, count) {
        const cramiList = [];
        for (let i = 0; i < count; i++) {
            const code = (0, utils_1.generateCramiCode)();
            const crami = this.cramiEntity.create({ ...cramiInfo, code });
            cramiList.push(crami);
        }
        return await this.cramiEntity.save(cramiList);
    }
    async useCrami(req, body) {
        const { id } = req.user;
        const crami = await this.cramiEntity.findOne({
            where: { code: body.code },
        });
        if (!crami) {
            throw new common_1.HttpException('当前卡密不存在、请确认您输入的卡密是否正确！', common_1.HttpStatus.BAD_REQUEST);
        }
        const { status, days = -1, model3Count = 0, model4Count = 0, drawMjCount = 0, packageId, appCats, } = crami;
        if (status === 1) {
            throw new common_1.HttpException('当前卡密已被使用、请确认您输入的卡密是否正确！', common_1.HttpStatus.BAD_REQUEST);
        }
        const balanceInfo = {
            model3Count,
            model4Count,
            drawMjCount,
            packageId,
            appCats,
        };
        await this.userBalanceService.addBalanceToUser(id, { ...balanceInfo }, days);
        await this.userBalanceService.saveRecordRechargeLog({
            userId: id,
            rechargeType: balance_constant_1.RechargeType.PACKAGE_GIFT,
            model3Count,
            model4Count,
            drawMjCount,
            days,
        });
        await this.cramiEntity.update({ code: body.code }, { useId: id, status: 1 });
        return '使用卡密成功';
    }
    async queryAllCrami(params, req) {
        const { page = 1, size = 10, status, useId } = params;
        const where = {};
        status && Object.assign(where, { status });
        useId && Object.assign(where, { useId });
        const [rows, count] = await this.cramiEntity.findAndCount({
            skip: (page - 1) * size,
            take: size,
            order: { createdAt: 'DESC' },
            where,
        });
        const userIds = rows.map(t => t.useId);
        const packageIds = rows.map(t => t.packageId);
        const userInfos = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
        });
        const packageInfos = await this.cramiPackageEntity.find({
            where: { id: (0, typeorm_2.In)(packageIds) },
        });
        rows.forEach((t) => {
            t.username = userInfos.find(u => u.id === t.useId)?.username;
            t.email = userInfos.find(u => u.id === t.useId)?.email;
            t.packageName = packageInfos.find(p => p.id === t.packageId)?.name;
        });
        req.user.role !== 'super' && rows.forEach((t) => (t.email = (0, utils_1.maskEmail)(t.email)));
        req.user.role !== 'super' && rows.forEach((t) => (t.code = (0, utils_1.maskCrami)(t.code)));
        return { rows, count };
    }
    async delCrami(id) {
        const c = await this.cramiEntity.findOne({ where: { id } });
        if (!c) {
            throw new common_1.HttpException('当前卡密不存在、请确认您要删除的卡密是否存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        if (c.status === 1) {
            throw new common_1.HttpException('当前卡密已被使用、已使用的卡密禁止删除！', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.cramiEntity.delete({ id });
    }
    async batchDelCrami(body) {
        const { ids } = body;
        const res = await this.cramiEntity.delete(ids);
        if (res.affected > 0) {
            return '删除卡密成功！';
        }
        else {
            throw new common_1.HttpException('删除卡密失败、请重试！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.CramiService = CramiService;
exports.CramiService = CramiService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(crami_entity_1.CramiEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(cramiPackage_entity_1.CramiPackageEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _c : Object, typeof (_d = typeof userBalance_service_1.UserBalanceService !== "undefined" && userBalance_service_1.UserBalanceService) === "function" ? _d : Object])
], CramiService);


/***/ }),
/* 190 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CramiEntity = void 0;
const baseEntity_1 = __webpack_require__(72);
const typeorm_1 = __webpack_require__(3);
let CramiEntity = class CramiEntity extends baseEntity_1.BaseEntity {
    code;
    cramiType;
    packageId;
    status;
    useId;
    days;
    model3Count;
    model4Count;
    drawMjCount;
    appCats;
};
exports.CramiEntity = CramiEntity;
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: '存储卡密CDK编码', length: 50 }),
    __metadata("design:type", String)
], CramiEntity.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '卡密CDK类型：1： 普通 | 2： 单人可使用一次 ',
        default: 1,
    }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "cramiType", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '卡密CDK类型： 默认套餐类型 | 不填就是自定义类型',
        nullable: true,
    }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "packageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密CDK状态，如已使用、未使用等', default: 0 }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密使用账户用户ID信息', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "useId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '卡密有效期天数、从生成创建的时候开始计算，设为0则不限时间',
        default: 0,
    }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "days", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密模型3额度', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "model3Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密模型4额度', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "model4Count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密MJ绘画额度', nullable: true }),
    __metadata("design:type", Number)
], CramiEntity.prototype, "drawMjCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '卡密应用分类列表', nullable: true, default: '' }),
    __metadata("design:type", String)
], CramiEntity.prototype, "appCats", void 0);
exports.CramiEntity = CramiEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'crami' })
], CramiEntity);


/***/ }),
/* 191 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BatchDelCramiDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class BatchDelCramiDto {
    ids;
}
exports.BatchDelCramiDto = BatchDelCramiDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要删除的套餐Ids', required: true }),
    (0, class_validator_1.IsArray)({ message: '参数类型为数组' }),
    (0, class_validator_1.ArrayMinSize)(1, { message: '最短长度为1' }),
    __metadata("design:type", Array)
], BatchDelCramiDto.prototype, "ids", void 0);


/***/ }),
/* 192 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreatCramiDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class CreatCramiDto {
    packageId;
    count;
    model3Count;
    model4Count;
    drawMjCount;
}
exports.CreatCramiDto = CreatCramiDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '套餐类型', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: '套餐类型必须是number' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "packageId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '单次生成卡密数量' }),
    (0, class_validator_1.IsNumber)({}, { message: '创建卡密的张数数量' }),
    (0, class_validator_1.Max)(50, { message: '单次创建卡密的张数数量不能超过50张' }),
    (0, class_validator_1.Min)(1, { message: '单次创建卡密的张数数量不能少于1张' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0, description: '卡密携带模型3额度' }),
    (0, class_validator_1.IsNumber)({}, { message: '卡密携带的余额必须是number' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "model3Count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 100, description: '卡密携带模型4额度' }),
    (0, class_validator_1.IsNumber)({}, { message: '卡密携带额度类型必须是number' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "model4Count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3, description: '卡密携带MJ绘画额度' }),
    (0, class_validator_1.IsNumber)({}, { message: '卡密携带额度类型必须是number' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatCramiDto.prototype, "drawMjCount", void 0);


/***/ }),
/* 193 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreatePackageDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_transformer_1 = __webpack_require__(170);
const class_validator_1 = __webpack_require__(110);
class CreatePackageDto {
    name;
    des;
    weight;
    deductionType;
    coverImg;
    price;
    order;
    status;
    days;
    model3Count;
    model4Count;
    drawMjCount;
    appCats;
}
exports.CreatePackageDto = CreatePackageDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '基础套餐100次卡',
        description: '套餐名称',
        required: true,
    }),
    (0, class_validator_1.IsDefined)({ message: '套餐名称是必传参数' }),
    __metadata("design:type", String)
], CreatePackageDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '这是一个100次对话余额的套餐，我们将为您额外赠送3次绘画余额，活动期间，我们将在套餐基础上额外赠送您十次对话余额和1次绘画余额',
        description: '套餐详情描述',
        required: true,
    }),
    (0, class_validator_1.IsDefined)({ message: '套餐描述是必传参数' }),
    __metadata("design:type", String)
], CreatePackageDto.prototype, "des", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 7, default: 0, description: '套餐等级设置' }),
    (0, class_validator_1.IsNumber)({}, { message: '套餐等级权重必须为数字' }),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "weight", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: '套餐扣费类型 1：按次数 2：按Token',
        required: true,
    }),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "deductionType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://xxxx.png', description: '套餐封面图片' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePackageDto.prototype, "coverImg", void 0);
__decorate([
    (0, class_transformer_1.Transform)(({ value }) => parseFloat(value)),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "price", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 100, description: '套餐排序、数字越大越靠前' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: '套餐状态 0：禁用 1：启用',
        required: true,
    }),
    (0, class_validator_1.IsNumber)({}, { message: '套餐状态必须是Number' }),
    (0, class_validator_1.IsIn)([0, 1], { message: '套餐状态错误' }),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 7,
        default: 0,
        description: '套餐有效期 -1为永久不过期',
    }),
    (0, class_validator_1.IsNumber)({}, { message: '套餐有效期天数类型必须是number' }),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1000, default: 0, description: '模型3对话次数' }),
    (0, class_validator_1.IsNumber)({}, { message: '模型3对话次数必须是number类型' }),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "model3Count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, default: 0, description: '模型4对话次数' }),
    (0, class_validator_1.IsNumber)({}, { message: '模型4对话次数必须是number类型' }),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "model4Count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, default: 0, description: 'MJ绘画次数' }),
    (0, class_validator_1.IsNumber)({}, { message: 'MJ绘画次数必须是number类型' }),
    __metadata("design:type", Number)
], CreatePackageDto.prototype, "drawMjCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1,2,3', description: '套餐包含的应用分类' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePackageDto.prototype, "appCats", void 0);


/***/ }),
/* 194 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DeletePackageDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_validator_1 = __webpack_require__(110);
class DeletePackageDto {
    id;
}
exports.DeletePackageDto = DeletePackageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要修改的套餐Id', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: '套餐ID必须是Number' }),
    __metadata("design:type", Number)
], DeletePackageDto.prototype, "id", void 0);


/***/ }),
/* 195 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuerAllCramiDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QuerAllCramiDto {
    page;
    size;
    useId;
    status;
}
exports.QuerAllCramiDto = QuerAllCramiDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllCramiDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllCramiDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '使用人Id', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllCramiDto.prototype, "useId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: '卡密状态 0：未使用 1：已消费',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllCramiDto.prototype, "status", void 0);


/***/ }),
/* 196 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuerAllPackageDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QuerAllPackageDto {
    page;
    size;
    name;
    status;
    type;
}
exports.QuerAllPackageDto = QuerAllPackageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllPackageDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllPackageDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'name', description: '套餐名称', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAllPackageDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: '套餐状态 0：禁用 1：启用',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllPackageDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1,
        description: '套餐类型 -1：永久套餐 1：限时套餐',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllPackageDto.prototype, "type", void 0);


/***/ }),
/* 197 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdatePackageDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
const createPackage_dto_1 = __webpack_require__(193);
class UpdatePackageDto extends createPackage_dto_1.CreatePackageDto {
    id;
}
exports.UpdatePackageDto = UpdatePackageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要修改的套餐Id', required: true }),
    (0, class_validator_1.IsNumber)({}, { message: '套餐ID必须是Number' }),
    __metadata("design:type", Number)
], UpdatePackageDto.prototype, "id", void 0);


/***/ }),
/* 198 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UseCramiDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class UseCramiDto {
    code;
}
exports.UseCramiDto = UseCramiDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'ffar684rv254fs4f',
        description: '卡密信息',
        required: true,
    }),
    (0, class_validator_1.IsDefined)({ message: '套餐名称是必传参数' }),
    __metadata("design:type", String)
], UseCramiDto.prototype, "code", void 0);


/***/ }),
/* 199 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DatabaseModule_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DatabaseModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const database_service_1 = __webpack_require__(200);
const app_entity_1 = __webpack_require__(106);
const appCats_entity_1 = __webpack_require__(107);
const userApps_entity_1 = __webpack_require__(108);
const autoReply_entity_1 = __webpack_require__(136);
const badWords_entity_1 = __webpack_require__(144);
const violationLog_entity_1 = __webpack_require__(145);
const chatGroup_entity_1 = __webpack_require__(82);
const chatLog_entity_1 = __webpack_require__(75);
const crami_entity_1 = __webpack_require__(190);
const cramiPackage_entity_1 = __webpack_require__(71);
const config_entity_1 = __webpack_require__(73);
const models_entity_1 = __webpack_require__(78);
const order_entity_1 = __webpack_require__(201);
const plugin_entity_1 = __webpack_require__(159);
const share_entity_1 = __webpack_require__(202);
const signIn_entity_1 = __webpack_require__(203);
const user_entity_1 = __webpack_require__(83);
const accountLog_entity_1 = __webpack_require__(79);
const balance_entity_1 = __webpack_require__(80);
const fingerprint_entity_1 = __webpack_require__(84);
const userBalance_entity_1 = __webpack_require__(81);
const verification_entity_1 = __webpack_require__(101);
let DatabaseModule = DatabaseModule_1 = class DatabaseModule {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    logger = new common_1.Logger(DatabaseModule_1.name);
    async onModuleInit() {
        const { database } = this.connection.options;
        this.logger.log(`Your MySQL database named ${database} has been connected`);
    }
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = DatabaseModule_1 = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRootAsync({
                useFactory: () => ({
                    type: 'mysql',
                    host: process.env.DB_HOST,
                    port: parseInt(process.env.DB_PORT, 10),
                    username: process.env.DB_USER,
                    password: process.env.DB_PASS,
                    database: process.env.DB_DATABASE,
                    entities: [
                        share_entity_1.Share,
                        autoReply_entity_1.AutoReplyEntity,
                        crami_entity_1.CramiEntity,
                        cramiPackage_entity_1.CramiPackageEntity,
                        badWords_entity_1.BadWordsEntity,
                        chatGroup_entity_1.ChatGroupEntity,
                        verification_entity_1.VerificationEntity,
                        signIn_entity_1.SigninEntity,
                        violationLog_entity_1.ViolationLogEntity,
                        models_entity_1.ModelsEntity,
                        user_entity_1.UserEntity,
                        accountLog_entity_1.AccountLogEntity,
                        fingerprint_entity_1.FingerprintLogEntity,
                        balance_entity_1.BalanceEntity,
                        userBalance_entity_1.UserBalanceEntity,
                        plugin_entity_1.PluginEntity,
                        config_entity_1.ConfigEntity,
                        chatLog_entity_1.ChatLogEntity,
                        userApps_entity_1.UserAppsEntity,
                        appCats_entity_1.AppCatsEntity,
                        app_entity_1.AppEntity,
                        order_entity_1.OrderEntity,
                    ],
                    synchronize: false,
                    logging: false,
                    charset: 'utf8mb4',
                    timezone: '+08:00',
                }),
            }),
        ],
        providers: [database_service_1.DatabaseService],
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.DataSource !== "undefined" && typeorm_2.DataSource) === "function" ? _a : Object])
], DatabaseModule);


/***/ }),
/* 200 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DatabaseService = void 0;
const common_1 = __webpack_require__(2);
const bcrypt = __webpack_require__(93);
const typeorm_1 = __webpack_require__(3);
let DatabaseService = class DatabaseService {
    connection;
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
            const superEmail = 'super';
            const superUserinfo = {
                username: 'super',
                password: superPassword,
                status: 1,
                email: superEmail,
                sex: 1,
                role: 'super',
            };
            await this.createDefaultUser(superUserinfo);
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
  SELECT COUNT(*) AS count FROM config WHERE \`configKey\` IN (${keys.map(k => `'${k}'`).join(',')})
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
                { configKey: 'siteName', configVal: '', public: 1, encrypt: 0 },
                { configKey: 'robotAvatar', configVal: '', public: 1, encrypt: 0 },
                {
                    configKey: 'userDefaultAvatar',
                    configVal: '',
                    public: 0,
                    encrypt: 0,
                },
                { configKey: 'baiduCode', configVal: code, public: 1, encrypt: 0 },
                { configKey: 'baiduSiteId', configVal: '', public: 0, encrypt: 0 },
                {
                    configKey: 'baiduToken',
                    configVal: '',
                    public: 0,
                    encrypt: 0,
                },
                {
                    configKey: 'openaiBaseUrl',
                    configVal: 'https://api.lightai.io',
                    public: 0,
                    encrypt: 0,
                },
                { configKey: 'openaiBaseKey', configVal: 'sk-', public: 0, encrypt: 0 },
                { configKey: 'noticeInfo', configVal: noticeInfo, public: 1, encrypt: 0 },
                {
                    configKey: 'registerSendStatus',
                    configVal: '1',
                    public: 1,
                    encrypt: 0,
                },
                {
                    configKey: 'registerSendModel3Count',
                    configVal: '30',
                    public: 1,
                    encrypt: 0,
                },
                {
                    configKey: 'registerSendModel4Count',
                    configVal: '3',
                    public: 1,
                    encrypt: 0,
                },
                {
                    configKey: 'registerSendDrawMjCount',
                    configVal: '3',
                    public: 1,
                    encrypt: 0,
                },
                {
                    configKey: 'firstRegisterSendStatus',
                    configVal: '1',
                    public: 1,
                    encrypt: 0,
                },
                {
                    configKey: 'firstRegisterSendRank',
                    configVal: '500',
                    public: 1,
                    encrypt: 0,
                },
                {
                    configKey: 'firstRegisterSendModel3Count',
                    configVal: '10',
                    public: 1,
                    encrypt: 0,
                },
                {
                    configKey: 'firstRegisterSendModel4Count',
                    configVal: '10',
                    public: 1,
                    encrypt: 0,
                },
                {
                    configKey: 'firstRegisterSendDrawMjCount',
                    configVal: '10',
                    public: 1,
                    encrypt: 0,
                },
                { configKey: 'isVerifyEmail', configVal: '1', public: 1, encrypt: 0 },
                { configKey: 'model3Name', configVal: '普通积分', public: 1, encrypt: 0 },
                { configKey: 'model4Name', configVal: '高级积分', public: 1, encrypt: 0 },
                { configKey: 'drawMjName', configVal: '绘画积分', public: 1, encrypt: 0 },
                {
                    configKey: 'drawingStyles',
                    configVal: '油画风格,像素风格,赛博朋克,动漫,日系,超现实主义,油画,卡通,插画,海报,写实,扁平,中国风,水墨画,唯美二次元,印象派,炫彩插画,像素艺术,艺术创想,色彩主义,数字艺术',
                    public: 1,
                    encrypt: 0,
                },
            ];
            const res = await this.connection.query(`INSERT INTO config (configKey, configVal, public, encrypt) VALUES ${defaultConfig
                .map(d => `('${d.configKey}', '${d.configVal.replace(/'/g, "\\'")}', '${d.public}', '${d.encrypt}')`)
                .join(', ')}`);
            common_1.Logger.log(`初始化网站配置信息成功、如您需要修改网站配置信息，请前往管理系统系统配置设置 ==============> 请注意查阅`, 'DatabaseService');
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('创建默认网站配置失败！', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_1.Connection !== "undefined" && typeorm_1.Connection) === "function" ? _a : Object])
], DatabaseService);


/***/ }),
/* 201 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OrderEntity = void 0;
const typeorm_1 = __webpack_require__(3);
const baseEntity_1 = __webpack_require__(72);
let OrderEntity = class OrderEntity extends baseEntity_1.BaseEntity {
    orderId;
    tradeId;
    payPlatform;
    userId;
    goodsId;
    count;
    price;
    total;
    status;
    paydAt;
    channel;
};
exports.OrderEntity = OrderEntity;
__decorate([
    (0, typeorm_1.Column)({ unique: true, comment: '订单ID', length: 64 }),
    __metadata("design:type", String)
], OrderEntity.prototype, "orderId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        unique: true,
        comment: '交易ID（服务商）',
        length: 32,
        nullable: true,
    }),
    __metadata("design:type", String)
], OrderEntity.prototype, "tradeId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '支付平台【epay|hupi|ltzf】）',
        length: 32,
        nullable: true,
    }),
    __metadata("design:type", String)
], OrderEntity.prototype, "payPlatform", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID', nullable: true }),
    __metadata("design:type", Number)
], OrderEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '商品ID', nullable: true }),
    __metadata("design:type", Number)
], OrderEntity.prototype, "goodsId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '数量', default: 1 }),
    __metadata("design:type", Number)
], OrderEntity.prototype, "count", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '套餐价格￥', type: 'decimal', scale: 2, precision: 10 }),
    __metadata("design:type", Number)
], OrderEntity.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '订单总金额', type: 'decimal', scale: 2, precision: 10 }),
    __metadata("design:type", Number)
], OrderEntity.prototype, "total", void 0);
__decorate([
    (0, typeorm_1.Column)({
        comment: '订单状态（0：未支付、1：已支付、2、支付失败、3：支付超时）',
        default: 0,
    }),
    __metadata("design:type", Number)
], OrderEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime', length: 0, nullable: true, comment: '支付时间' }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], OrderEntity.prototype, "paydAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '支付渠道）', length: 32, nullable: true }),
    __metadata("design:type", String)
], OrderEntity.prototype, "channel", void 0);
exports.OrderEntity = OrderEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'order' })
], OrderEntity);


/***/ }),
/* 202 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Share = void 0;
const typeorm_1 = __webpack_require__(3);
let Share = class Share {
    id;
    shareCode;
    htmlContent;
    createdAt;
};
exports.Share = Share;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Share.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 8, unique: true }),
    __metadata("design:type", String)
], Share.prototype, "shareCode", void 0);
__decorate([
    (0, typeorm_1.Column)('mediumtext'),
    __metadata("design:type", String)
], Share.prototype, "htmlContent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], Share.prototype, "createdAt", void 0);
exports.Share = Share = __decorate([
    (0, typeorm_1.Entity)('share')
], Share);


/***/ }),
/* 203 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SigninEntity = void 0;
const typeorm_1 = __webpack_require__(3);
const baseEntity_1 = __webpack_require__(72);
let SigninEntity = class SigninEntity extends baseEntity_1.BaseEntity {
    userId;
    signInDate;
    signInTime;
    isSigned;
};
exports.SigninEntity = SigninEntity;
__decorate([
    (0, typeorm_1.Column)({ comment: '用户ID' }),
    __metadata("design:type", Number)
], SigninEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '签到日期' }),
    __metadata("design:type", String)
], SigninEntity.prototype, "signInDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ comment: '签到时间' }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], SigninEntity.prototype, "signInTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], SigninEntity.prototype, "isSigned", void 0);
exports.SigninEntity = SigninEntity = __decorate([
    (0, typeorm_1.Entity)({ name: 'signin' })
], SigninEntity);


/***/ }),
/* 204 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GlobalConfigModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const chatLog_entity_1 = __webpack_require__(75);
const config_entity_1 = __webpack_require__(73);
const globalConfig_controller_1 = __webpack_require__(205);
const globalConfig_service_1 = __webpack_require__(74);
let GlobalConfigModule = class GlobalConfigModule {
};
exports.GlobalConfigModule = GlobalConfigModule;
exports.GlobalConfigModule = GlobalConfigModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([config_entity_1.ConfigEntity, chatLog_entity_1.ChatLogEntity])],
        providers: [globalConfig_service_1.GlobalConfigService],
        controllers: [globalConfig_controller_1.GlobalConfigController],
        exports: [globalConfig_service_1.GlobalConfigService],
    })
], GlobalConfigModule);


/***/ }),
/* 205 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GlobalConfigController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const queryConfig_dto_1 = __webpack_require__(206);
const setConfig_dto_1 = __webpack_require__(207);
const globalConfig_service_1 = __webpack_require__(74);
let GlobalConfigController = class GlobalConfigController {
    globalConfigService;
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    queryAllConfig(req) {
        return this.globalConfigService.queryAllConfig(req);
    }
    queryFrontConfig(query, req) {
        return this.globalConfigService.queryFrontConfig(query, req);
    }
    queryConfig(body, req) {
        return this.globalConfigService.queryConfig(body, req);
    }
    setConfig(body) {
        return this.globalConfigService.setConfig(body);
    }
    queryNotice() {
        return this.globalConfigService.queryNotice();
    }
};
exports.GlobalConfigController = GlobalConfigController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '查询所有配置' }),
    (0, common_1.Get)('queryAll'),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryAllConfig", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '查询前端网站的所有配置' }),
    (0, common_1.Get)('queryFront'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryFrontConfig", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '查询所有配置' }),
    (0, common_1.Post)('query'),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof queryConfig_dto_1.QueryConfigDto !== "undefined" && queryConfig_dto_1.QueryConfigDto) === "function" ? _d : Object, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryConfig", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '设置配置信息' }),
    (0, common_1.Post)('set'),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof setConfig_dto_1.SetConfigDto !== "undefined" && setConfig_dto_1.SetConfigDto) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "setConfig", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: '用户端查询公告信息' }),
    (0, common_1.Get)('notice'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GlobalConfigController.prototype, "queryNotice", null);
exports.GlobalConfigController = GlobalConfigController = __decorate([
    (0, swagger_1.ApiTags)('config'),
    (0, common_1.Controller)('config'),
    __metadata("design:paramtypes", [typeof (_a = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _a : Object])
], GlobalConfigController);


/***/ }),
/* 206 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryConfigDto = void 0;
const class_validator_1 = __webpack_require__(110);
const class_transformer_1 = __webpack_require__(170);
const swagger_1 = __webpack_require__(14);
class QueryConfigDto {
    keys;
}
exports.QueryConfigDto = QueryConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['siteName', 'qqNumber'],
        description: '想要查询的配置key',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_transformer_1.Type)(() => String),
    __metadata("design:type", Array)
], QueryConfigDto.prototype, "keys", void 0);


/***/ }),
/* 207 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetConfigDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_transformer_1 = __webpack_require__(170);
const class_validator_1 = __webpack_require__(110);
class SetConfigDto {
    settings;
}
exports.SetConfigDto = SetConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: [{ configKey: 'siteName', configVal: 'AIWeb' }],
        description: '设置配置信息',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => Object),
    __metadata("design:type", Array)
], SetConfigDto.prototype, "settings", void 0);


/***/ }),
/* 208 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ModelsModule = void 0;
const common_1 = __webpack_require__(2);
const models_controller_1 = __webpack_require__(209);
const models_service_1 = __webpack_require__(76);
const typeorm_1 = __webpack_require__(33);
const models_entity_1 = __webpack_require__(78);
let ModelsModule = class ModelsModule {
};
exports.ModelsModule = ModelsModule;
exports.ModelsModule = ModelsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([models_entity_1.ModelsEntity])],
        controllers: [models_controller_1.ModelsController],
        providers: [models_service_1.ModelsService],
        exports: [models_service_1.ModelsService],
    })
], ModelsModule);


/***/ }),
/* 209 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ModelsController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const queryModel_dto_1 = __webpack_require__(210);
const queryModelType_dto_1 = __webpack_require__(211);
const setModel_dto_1 = __webpack_require__(212);
const setModelType_dto_1 = __webpack_require__(213);
const models_service_1 = __webpack_require__(76);
let ModelsController = class ModelsController {
    modelsService;
    constructor(modelsService) {
        this.modelsService = modelsService;
    }
    setModel(params) {
        return this.modelsService.setModel(params);
    }
    delModel(params) {
        return this.modelsService.delModel(params);
    }
    queryModels(req, params) {
        return this.modelsService.queryModels(req, params);
    }
    modelsList() {
        return this.modelsService.modelsList();
    }
    baseConfig() {
        return this.modelsService.getBaseConfig();
    }
    queryModelType(params) {
        return this.modelsService.queryModelType(params);
    }
    setModelType(params) {
        return this.modelsService.setModelType(params);
    }
    delModelType(params) {
        return this.modelsService.delModelType(params);
    }
};
exports.ModelsController = ModelsController;
__decorate([
    (0, common_1.Post)('setModel'),
    (0, swagger_1.ApiOperation)({ summary: '设置模型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof setModel_dto_1.SetModelDto !== "undefined" && setModel_dto_1.SetModelDto) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "setModel", null);
__decorate([
    (0, common_1.Post)('delModel'),
    (0, swagger_1.ApiOperation)({ summary: '删除模型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "delModel", null);
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '管理端查询模型列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof Request !== "undefined" && Request) === "function" ? _c : Object, typeof (_d = typeof queryModel_dto_1.QueryModelDto !== "undefined" && queryModel_dto_1.QueryModelDto) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "queryModels", null);
__decorate([
    (0, common_1.Get)('list'),
    (0, swagger_1.ApiOperation)({ summary: '客户端查询当前所有可以使用的模型' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "modelsList", null);
__decorate([
    (0, common_1.Get)('baseConfig'),
    (0, swagger_1.ApiOperation)({ summary: '客户端查询当前已经配置模型的基础配置' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "baseConfig", null);
__decorate([
    (0, common_1.Get)('queryModelType'),
    (0, swagger_1.ApiOperation)({ summary: '查询模型类型' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof queryModelType_dto_1.QueryModelTypeDto !== "undefined" && queryModelType_dto_1.QueryModelTypeDto) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "queryModelType", null);
__decorate([
    (0, common_1.Post)('setModelType'),
    (0, swagger_1.ApiOperation)({ summary: '创建修改模型类型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof setModelType_dto_1.SetModelTypeDto !== "undefined" && setModelType_dto_1.SetModelTypeDto) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "setModelType", null);
__decorate([
    (0, common_1.Post)('delModelType'),
    (0, swagger_1.ApiOperation)({ summary: '删除模型类型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ModelsController.prototype, "delModelType", null);
exports.ModelsController = ModelsController = __decorate([
    (0, swagger_1.ApiTags)('models'),
    (0, common_1.Controller)('models'),
    __metadata("design:paramtypes", [typeof (_a = typeof models_service_1.ModelsService !== "undefined" && models_service_1.ModelsService) === "function" ? _a : Object])
], ModelsController);


/***/ }),
/* 210 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryModelDto = void 0;
const swagger_1 = __webpack_require__(14);
class QueryModelDto {
    page;
    size;
    keyType;
    key;
    status;
    model;
}
exports.QueryModelDto = QueryModelDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '页码', required: true }),
    __metadata("design:type", Number)
], QueryModelDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '数量', required: true }),
    __metadata("design:type", Number)
], QueryModelDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '模型类型', required: true }),
    __metadata("design:type", Number)
], QueryModelDto.prototype, "keyType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'dsadgadaorjoqm',
        description: '模型key',
        required: true,
    }),
    __metadata("design:type", String)
], QueryModelDto.prototype, "key", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否开启当前key对应的模型',
        required: true,
    }),
    __metadata("design:type", Boolean)
], QueryModelDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'gpt-3.5',
        description: '当前key绑定的模型是多少 需要调用的模型',
        required: true,
    }),
    __metadata("design:type", String)
], QueryModelDto.prototype, "model", void 0);


/***/ }),
/* 211 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryModelTypeDto = void 0;
const swagger_1 = __webpack_require__(14);
class QueryModelTypeDto {
    page;
    size;
    keyType;
    status;
}
exports.QueryModelTypeDto = QueryModelTypeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '页码', required: true }),
    __metadata("design:type", Number)
], QueryModelTypeDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '数量', required: true }),
    __metadata("design:type", Number)
], QueryModelTypeDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '模型类型', required: true }),
    __metadata("design:type", Number)
], QueryModelTypeDto.prototype, "keyType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否开启当前key对应的模型',
        required: true,
    }),
    __metadata("design:type", Boolean)
], QueryModelTypeDto.prototype, "status", void 0);


/***/ }),
/* 212 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetModelDto = void 0;
const swagger_1 = __webpack_require__(14);
class SetModelDto {
    id;
    keyType;
    modelName;
    key;
    status;
    model;
    modelOrder;
    modelAvatar;
    maxModelTokens;
    proxyUrl;
    timeout;
    keyStatus;
    deductType;
    deduct;
    maxRounds;
    isDraw;
    isFileUpload;
    isTokenBased;
    tokenFeeRatio;
}
exports.SetModelDto = SetModelDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'key id', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '模型类型', required: true }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "keyType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '默认', description: '模型中文名称', required: true }),
    __metadata("design:type", String)
], SetModelDto.prototype, "modelName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'sk-', description: '模型key', required: false }),
    __metadata("design:type", Object)
], SetModelDto.prototype, "key", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否开启当前key对应的模型',
        required: true,
    }),
    __metadata("design:type", Boolean)
], SetModelDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'gpt-3.5',
        description: '当前key绑定的模型是多少 需要调用的模型',
        required: true,
    }),
    __metadata("design:type", String)
], SetModelDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '模型排序' }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "modelOrder", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://***.png', required: false }),
    __metadata("design:type", String)
], SetModelDto.prototype, "modelAvatar", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 4096,
        description: '模型支持的最大TOken数量',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "maxModelTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '模型的代理地址',
        required: false,
    }),
    __metadata("design:type", String)
], SetModelDto.prototype, "proxyUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 300, description: '模型超时时间', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "timeout", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'key状态', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "keyStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '扣费类型 1： 普通 2： 高级余额',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "deductType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: '单次扣除金额', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "deduct", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '最大上下文轮次',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "maxRounds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否设置为绘画Key',
        required: false,
    }),
    __metadata("design:type", Boolean)
], SetModelDto.prototype, "isDraw", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否支持文件上传',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "isFileUpload", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否使用token计费',
        required: false,
    }),
    __metadata("design:type", Boolean)
], SetModelDto.prototype, "isTokenBased", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'token计费比例', required: false }),
    __metadata("design:type", Number)
], SetModelDto.prototype, "tokenFeeRatio", void 0);


/***/ }),
/* 213 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetModelTypeDto = void 0;
const swagger_1 = __webpack_require__(14);
class SetModelTypeDto {
    id;
    keyType;
    modelName;
    status;
    model;
    timeout;
    deductType;
    isFileUpload;
    deduct;
    order;
    maxTokens;
    maxResponseTokens;
    maxRounds;
    isDallE3;
    isUseTool;
}
exports.SetModelTypeDto = SetModelTypeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: 'model id', required: false }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '模型类型', required: true }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "keyType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '普通模型',
        description: '模型中文名称',
        required: true,
    }),
    __metadata("design:type", String)
], SetModelTypeDto.prototype, "modelName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否开启当前key对应的模型',
        required: true,
    }),
    __metadata("design:type", Boolean)
], SetModelTypeDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'gpt-3.5',
        description: '当前key绑定的模型是多少 需要调用的模型',
        required: true,
    }),
    __metadata("design:type", String)
], SetModelTypeDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 300, description: '模型超时时间', required: false }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "timeout", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '扣费类型 1： 普通 2： 高级余额',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "deductType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '文件上传类型 0 : 不使用 1: ALL类型 2: 4V类型',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "isFileUpload", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: '单次扣除金额', required: false }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "deduct", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '排序id 越大越靠前',
        default: 100,
    }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "order", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 4000,
        description: '模型允许用户使用的最大token设置过高意味着单次的上下文会很高控制模型上下文控制使用token数量',
        required: true,
    }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "maxTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 1000,
        description: '模型支持的最大回复TOken数量',
        required: true,
    }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "maxResponseTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '最大上下文轮次',
        required: false,
    }),
    __metadata("design:type", Number)
], SetModelTypeDto.prototype, "maxRounds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否设置为Dall-E3绘画Key',
        required: false,
    }),
    __metadata("design:type", Boolean)
], SetModelTypeDto.prototype, "isDallE3", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: true,
        description: '是否设置为工具key',
        required: false,
    }),
    __metadata("design:type", Boolean)
], SetModelTypeDto.prototype, "isUseTool", void 0);


/***/ }),
/* 214 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OfficialModule = void 0;
const common_1 = __webpack_require__(2);
const official_controller_1 = __webpack_require__(215);
const official_service_1 = __webpack_require__(218);
let OfficialModule = class OfficialModule {
};
exports.OfficialModule = OfficialModule;
exports.OfficialModule = OfficialModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        controllers: [official_controller_1.OfficialController],
        providers: [official_service_1.OfficialService],
        exports: [official_service_1.OfficialService],
    })
], OfficialModule);


/***/ }),
/* 215 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OfficialController = void 0;
const jwtAuth_guard_1 = __webpack_require__(87);
const superAuth_guard_1 = __webpack_require__(103);
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const createMenu_dto_1 = __webpack_require__(216);
const getQrCode_dto_1 = __webpack_require__(217);
const official_service_1 = __webpack_require__(218);
let OfficialController = class OfficialController {
    officialService;
    constructor(officialService) {
        this.officialService = officialService;
    }
    async notify(req, query, body) {
        common_1.Logger.debug('GET通知 - ' + JSON.stringify(query), 'OfficialController');
        const result = await this.officialService.verify(query.signature, query.nonce, query.timestamp);
        return result ? query.echostr : '';
    }
    async notifyPost(req, query, xmlData, res) {
        common_1.Logger.debug(`收到POST通知，完整请求体: ${JSON.stringify(xmlData)}`, 'OfficialController');
        if (!xmlData || !xmlData.xml) {
            common_1.Logger.warn('xmlData结构异常，缺少xml字段', 'OfficialController');
            return res.status(200).send('');
        }
        let xmlObject = xmlData.xml;
        if (Array.isArray(xmlObject)) {
            common_1.Logger.debug('XML解析为数组，取第一个元素', 'OfficialController');
            xmlObject = xmlObject[0];
        }
        else if (xmlObject.xml && Array.isArray(xmlObject.xml)) {
            common_1.Logger.debug('XML存在嵌套结构，使用内部xml数组的第一个元素', 'OfficialController');
            xmlObject = xmlObject.xml[0];
        }
        common_1.Logger.debug(`标准化后的XML对象: ${JSON.stringify(xmlObject)}`, 'OfficialController');
        const getXmlValue = field => {
            if (!xmlObject[field])
                return null;
            return Array.isArray(xmlObject[field]) ? xmlObject[field][0] : xmlObject[field];
        };
        const msgType = getXmlValue('MsgType') || getXmlValue('msgtype');
        const event = getXmlValue('Event') || getXmlValue('event');
        const eventKey = getXmlValue('EventKey') || getXmlValue('eventkey');
        const content = getXmlValue('Content') || getXmlValue('content');
        const fromUserName = getXmlValue('FromUserName') || getXmlValue('fromusername');
        common_1.Logger.debug(`提取的字段 - MsgType: ${msgType}, Event: ${event}, EventKey: ${eventKey}`, 'OfficialController');
        if (msgType === 'event') {
            common_1.Logger.log(`接收到事件类型消息: ${event}`, 'OfficialController');
            if (event === 'VIEW' || event === 'CLICK') {
                return res.status(200).send('');
            }
            if (event === 'SCAN') {
                common_1.Logger.log(`接收到扫码事件, SceneStr: ${eventKey}`, 'OfficialController');
                const sceneStr = eventKey;
                if (sceneStr.includes('/')) {
                    this.officialService.scanBindWx(fromUserName, sceneStr);
                    const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, 'officialBindAccountText');
                    return res.status(200).send(xmlMsg);
                }
                if (sceneStr.includes('#')) {
                    const result = await this.officialService.scanOldWechat(fromUserName, sceneStr);
                    let configKey;
                    if (result === true) {
                        configKey = 'officialOldAccountSuccessText';
                    }
                    else if (result === 'not_found') {
                        configKey = 'officialOldAccountNotFoundText';
                    }
                    else {
                        configKey = 'officialOldAccountFailText';
                    }
                    const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, configKey);
                    return res.status(200).send(xmlMsg);
                }
                this.officialService.scan(fromUserName, sceneStr);
                const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, 'officialScanLoginText');
                return res.status(200).send(xmlMsg);
            }
            if (event === 'subscribe') {
                common_1.Logger.log(`接收到订阅事件, EventKey: ${eventKey}`, 'OfficialController');
                const sceneStr = eventKey ? eventKey.split('qrscene_')[1] : null;
                common_1.Logger.debug(`处理的sceneStr: ${sceneStr}`, 'OfficialController');
                if (!sceneStr) {
                    const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, 'officialSubscribeText');
                    return res.status(200).send(xmlMsg);
                }
                if (sceneStr.includes('/')) {
                    this.officialService.scanBindWx(fromUserName, sceneStr);
                    const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, 'officialBindAccountText');
                    return res.status(200).send(xmlMsg);
                }
                if (sceneStr.includes('#')) {
                    common_1.Logger.log(`接收到旧账号迁移事件, SceneStr: ${sceneStr}`, 'OfficialController');
                    const result = await this.officialService.scanOldWechat(fromUserName, sceneStr);
                    let configKey;
                    if (result === true) {
                        configKey = 'officialOldAccountSuccessText';
                    }
                    else if (result === 'not_found') {
                        configKey = 'officialOldAccountNotFoundText';
                    }
                    else {
                        configKey = 'officialOldAccountFailText';
                    }
                    const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, configKey);
                    return res.status(200).send(xmlMsg);
                }
                this.officialService.scan(fromUserName, sceneStr);
                const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, 'officialSubscribeText');
                return res.status(200).send(xmlMsg);
            }
            if (event === 'unsubscribe') {
                common_1.Logger.log(`接收到取消订阅事件, 用户: ${fromUserName}`, 'OfficialController');
                return res.status(200).send('');
            }
        }
        if (msgType === 'text') {
            common_1.Logger.log(`接收到文本消息: ${content && content.substring(0, 20)}${content && content.length > 20 ? '...' : ''}`, 'OfficialController');
            const xmlMsg = await this.officialService.genXmlMsgByConfig(xmlObject, 'officialAutoReplyText');
            return res.status(200).send(xmlMsg);
        }
        common_1.Logger.debug(`未识别的消息类型: ${msgType}, 返回默认响应`, 'OfficialController');
        return 'success';
    }
    async getQRSceneStr() {
        return this.officialService.getQRSceneStr();
    }
    async getQRSceneStrByBind(req) {
        return this.officialService.getQRSceneStrByBind(req);
    }
    async getQRSceneStrByOldWechat(req) {
        common_1.Logger.log(`获取旧账号迁移二维码sceneStr - 用户ID: ${req.user.id}`, 'OfficialController');
        const sceneStr = await this.officialService.getQRSceneStrByOldWechat(req);
        common_1.Logger.log(`生成的sceneStr: ${sceneStr}`, 'OfficialController');
        return sceneStr;
    }
    async getQRCode(query) {
        common_1.Logger.log(`获取普通登录二维码 - sceneStr: ${query.sceneStr}`, 'OfficialController');
        if (process.env.ISDEV === 'true') {
            common_1.Logger.log('开发环境下，返回空二维码', 'OfficialController');
            return '';
        }
        try {
            const ticket = await this.officialService.getQRCodeTicket(query.sceneStr);
            common_1.Logger.log(`获取普通登录二维码ticket成功: ${ticket.substring(0, 20)}...`, 'OfficialController');
            const Url = (0, utils_1.formatUrl)(process.env.weChatMpUrl || 'https://mp.weixin.qq.com');
            const qrCodeUrl = `${Url}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
            common_1.Logger.log(`生成普通登录二维码URL: ${qrCodeUrl}`, 'OfficialController');
            return qrCodeUrl;
        }
        catch (error) {
            common_1.Logger.error(`获取普通登录二维码失败: ${error.message}`, 'OfficialController');
            throw error;
        }
    }
    async loginBySceneStr(req, body) {
        return this.officialService.loginBySceneStr(req, body);
    }
    async bindWxBySceneStr(req, body) {
        return this.officialService.bindWxBySceneStr(req, body.sceneStr);
    }
    async bindWxByOldWechat(req, body) {
        return this.officialService.bindWxByOldWechat(req, body.sceneStr);
    }
    async getRedirectUrl(body) {
        return this.officialService.getRedirectUrl(body.url);
    }
    async getJsapiTicket(body) {
        return this.officialService.getJsapiTicket(body.url);
    }
    async loginByCode(req, body) {
        return this.officialService.loginByCode(req, body.code);
    }
    async createMenu(menuData) {
        common_1.Logger.log('创建自定义菜单', 'OfficialController');
        return this.officialService.createMenu(menuData);
    }
    async getMenu() {
        common_1.Logger.log('获取自定义菜单', 'OfficialController');
        return this.officialService.getMenu();
    }
    async deleteMenu() {
        common_1.Logger.log('删除自定义菜单', 'OfficialController');
        return this.officialService.deleteMenu();
    }
    async getOldQRCode(query) {
        common_1.Logger.log(`获取旧公众号二维码 - sceneStr: ${query.sceneStr}`, 'OfficialController');
        if (process.env.ISDEV === 'true') {
            common_1.Logger.log('开发环境下，返回空二维码', 'OfficialController');
            return { success: true, data: '' };
        }
        try {
            const ticket = await this.officialService.getOldQRCodeTicket(query.sceneStr);
            const oldMpUrl = process.env.oldWeChatMpUrl;
            const defaultMpUrl = process.env.weChatMpUrl || 'https://mp.weixin.qq.com';
            const Url = (0, utils_1.formatUrl)(oldMpUrl || defaultMpUrl);
            common_1.Logger.log(`使用MP URL: ${Url} (oldWeChatMpUrl=${oldMpUrl}, defaultMpUrl=${defaultMpUrl})`, 'OfficialController');
            const qrCodeUrl = `${Url}/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
            common_1.Logger.log(`生成的二维码URL: ${qrCodeUrl}`, 'OfficialController');
            return qrCodeUrl;
        }
        catch (error) {
            common_1.Logger.error(`获取旧公众号二维码失败: ${error.message}`, 'OfficialController');
            throw error;
        }
    }
};
exports.OfficialController = OfficialController;
__decorate([
    (0, common_1.Get)('notify'),
    (0, swagger_1.ApiOperation)({ summary: '公众号通知接口GET' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "notify", null);
__decorate([
    (0, common_1.Post)('notify'),
    (0, swagger_1.ApiOperation)({ summary: '公众号通知接口POST' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "notifyPost", null);
__decorate([
    (0, common_1.Post)('getQRSceneStr'),
    (0, swagger_1.ApiOperation)({ summary: '获取登录二维码sceneStr' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getQRSceneStr", null);
__decorate([
    (0, common_1.Post)('getQRSceneStrByBind'),
    (0, swagger_1.ApiOperation)({ summary: '获取绑定二维码的sceneStr' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getQRSceneStrByBind", null);
__decorate([
    (0, common_1.Post)('getQRSceneStrByOldWechat'),
    (0, swagger_1.ApiOperation)({ summary: '获取旧账号迁移二维码的sceneStr' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getQRSceneStrByOldWechat", null);
__decorate([
    (0, common_1.Get)('getQRCode'),
    (0, swagger_1.ApiOperation)({ summary: '获取二维码' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof getQrCode_dto_1.GetQrCodeDto !== "undefined" && getQrCode_dto_1.GetQrCodeDto) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getQRCode", null);
__decorate([
    (0, common_1.Post)('loginBySceneStr'),
    (0, swagger_1.ApiOperation)({ summary: '扫码登录轮询查询' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object, Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "loginBySceneStr", null);
__decorate([
    (0, common_1.Post)('bindWxBySceneStr'),
    (0, swagger_1.ApiOperation)({ summary: '扫码绑定轮询查询' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object, typeof (_g = typeof getQrCode_dto_1.GetQrCodeDto !== "undefined" && getQrCode_dto_1.GetQrCodeDto) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "bindWxBySceneStr", null);
__decorate([
    (0, common_1.Post)('bindWxByOldWechat'),
    (0, swagger_1.ApiOperation)({ summary: '绑定旧账号微信轮询查询' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_h = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _h : Object, typeof (_j = typeof getQrCode_dto_1.GetQrCodeDto !== "undefined" && getQrCode_dto_1.GetQrCodeDto) === "function" ? _j : Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "bindWxByOldWechat", null);
__decorate([
    (0, common_1.Post)('getRedirectUrl'),
    (0, swagger_1.ApiOperation)({ summary: '获取登录跳转地址' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getRedirectUrl", null);
__decorate([
    (0, common_1.Post)('getJsapiTicket'),
    (0, swagger_1.ApiOperation)({ summary: '获取注册配置' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getJsapiTicket", null);
__decorate([
    (0, common_1.Post)('loginByCode'),
    (0, swagger_1.ApiOperation)({ summary: '公众号静默登录' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_k = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _k : Object, Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "loginByCode", null);
__decorate([
    (0, common_1.Post)('menu'),
    (0, swagger_1.ApiOperation)({ summary: '创建自定义菜单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_l = typeof createMenu_dto_1.CreateMenuDto !== "undefined" && createMenu_dto_1.CreateMenuDto) === "function" ? _l : Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "createMenu", null);
__decorate([
    (0, common_1.Get)('menu'),
    (0, swagger_1.ApiOperation)({ summary: '获取自定义菜单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getMenu", null);
__decorate([
    (0, common_1.Delete)('menu'),
    (0, swagger_1.ApiOperation)({ summary: '删除自定义菜单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "deleteMenu", null);
__decorate([
    (0, common_1.Get)('getOldQRCode'),
    (0, swagger_1.ApiOperation)({ summary: '获取旧公众号二维码（用于账号迁移）' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_m = typeof getQrCode_dto_1.GetQrCodeDto !== "undefined" && getQrCode_dto_1.GetQrCodeDto) === "function" ? _m : Object]),
    __metadata("design:returntype", Promise)
], OfficialController.prototype, "getOldQRCode", null);
exports.OfficialController = OfficialController = __decorate([
    (0, swagger_1.ApiTags)('official'),
    (0, common_1.Controller)('official'),
    __metadata("design:paramtypes", [typeof (_a = typeof official_service_1.OfficialService !== "undefined" && official_service_1.OfficialService) === "function" ? _a : Object])
], OfficialController);


/***/ }),
/* 216 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateMenuDto = void 0;
const swagger_1 = __webpack_require__(14);
const class_transformer_1 = __webpack_require__(170);
const class_validator_1 = __webpack_require__(110);
class ButtonBase {
    name;
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: '菜单标题，不超过16个字节，子菜单不超过60个字节' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ButtonBase.prototype, "name", void 0);
class SubButton extends ButtonBase {
    type;
    key;
    url;
    media_id;
    appid;
    pagepath;
    article_id;
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: '菜单的响应动作类型', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubButton.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '菜单KEY值，用于消息接口推送，不超过128字节', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubButton.prototype, "key", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '网页链接，用户点击菜单可打开链接，不超过1024字节', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubButton.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '调用新增永久素材接口返回的合法media_id', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubButton.prototype, "media_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '小程序的appid（仅认证公众号可配置）', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubButton.prototype, "appid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '小程序的页面路径', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubButton.prototype, "pagepath", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '发布后获得的合法article_id', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubButton.prototype, "article_id", void 0);
class Button extends ButtonBase {
    type;
    key;
    url;
    sub_button;
    media_id;
    appid;
    pagepath;
    article_id;
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: '菜单的响应动作类型', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Button.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '菜单KEY值，用于消息接口推送，不超过128字节', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Button.prototype, "key", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '网页链接，用户点击菜单可打开链接，不超过1024字节', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Button.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '二级菜单数组，个数应为1~5个', required: false }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => SubButton),
    __metadata("design:type", Array)
], Button.prototype, "sub_button", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '调用新增永久素材接口返回的合法media_id', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Button.prototype, "media_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '小程序的appid（仅认证公众号可配置）', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Button.prototype, "appid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '小程序的页面路径', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Button.prototype, "pagepath", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '发布后获得的合法article_id', required: false }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], Button.prototype, "article_id", void 0);
class CreateMenuDto {
    button;
}
exports.CreateMenuDto = CreateMenuDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '一级菜单数组，个数应为1~3个' }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => Button),
    __metadata("design:type", Array)
], CreateMenuDto.prototype, "button", void 0);


/***/ }),
/* 217 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GetQrCodeDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class GetQrCodeDto {
    sceneStr;
}
exports.GetQrCodeDto = GetQrCodeDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'dasdasg2441lk1o24bk',
        description: '1-64位的字符参数',
        required: true,
    }),
    (0, class_validator_1.IsDefined)({ message: 'sceneStr是必传参数' }),
    __metadata("design:type", String)
], GetQrCodeDto.prototype, "sceneStr", void 0);


/***/ }),
/* 218 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OfficialService = void 0;
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const axios_1 = __webpack_require__(39);
const crypto = __webpack_require__(16);
const autoReply_service_1 = __webpack_require__(135);
const chat_service_1 = __webpack_require__(168);
const auth_service_1 = __webpack_require__(90);
const globalConfig_service_1 = __webpack_require__(74);
const user_service_1 = __webpack_require__(97);
let OfficialService = class OfficialService {
    autoReplyService;
    userService;
    authService;
    globalConfigService;
    chatgptService;
    constructor(autoReplyService, userService, authService, globalConfigService, chatgptService) {
        this.autoReplyService = autoReplyService;
        this.userService = userService;
        this.authService = authService;
        this.globalConfigService = globalConfigService;
        this.chatgptService = chatgptService;
    }
    sceneStrMap = {};
    scanedSceneStrMap = {};
    async onModuleInit() {
        await this.globalConfigService.getWechatAccessToken(true);
        await this.globalConfigService.getOldWechatAccessToken(true);
    }
    async getQRSceneStr() {
        const sceneStr = (0, utils_1.createRandomNonceStr)(32);
        this.sceneStrMap[sceneStr] = true;
        return sceneStr;
    }
    async getQRSceneStrByBind(req) {
        const { id } = req.user;
        const sceneStr = `${(0, utils_1.createRandomNonceStr)(32)}/${id}`;
        this.sceneStrMap[sceneStr] = true;
        return sceneStr;
    }
    async getQRCodeTicket(sceneStr) {
        common_1.Logger.log(`开始获取普通二维码ticket，sceneStr: ${sceneStr}`, 'OfficialService');
        return this.fetchQRCodeTicket(sceneStr);
    }
    async getRedirectUrl(url) {
        const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
        const Url = (0, utils_1.formatUrl)(process.env.weChatOpenUrl || 'https://open.weixin.qq.com');
        const res = `${Url}/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodeURIComponent(url)}&response_type=code&scope=snsapi_userinfo&state=weChatLogin#wechat_redirect`;
        common_1.Logger.debug(`生成微信授权跳转URL: ${res}`);
        return res;
    }
    async getJsapiTicket(url) {
        const nonceStr = (0, utils_1.createRandomNonceStr)(32);
        const timestamp = (Date.now() / 1000).toFixed(0);
        const jsapiTicket = await this.globalConfigService.getConfigs(['wechatJsapiTicket']);
        const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
        const str = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
        const signature = this.sha1(str);
        common_1.Logger.debug(`生成JSAPI签名，URL: ${url}`);
        return { appId, nonceStr, timestamp, signature };
    }
    async fetchQRCodeTicket(sceneStr) {
        common_1.Logger.log(`获取普通二维码ticket - sceneStr: ${sceneStr}`, 'OfficialService');
        const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
        common_1.Logger.log(`获取普通二维码的access_token: ${accessToken.substring(0, 10)}...`, 'OfficialService');
        const Url = (0, utils_1.formatUrl)(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
        const params = {
            action_name: 'QR_STR_SCENE',
            action_info: { scene: { scene_str: sceneStr } },
        };
        common_1.Logger.log(`普通二维码请求参数: ${JSON.stringify(params)}`, 'OfficialService');
        const res = await axios_1.default.post(`${Url}/cgi-bin/qrcode/create?access_token=${accessToken}`, params);
        common_1.Logger.log(`普通二维码创建响应: ${JSON.stringify(res.data)}`, 'OfficialService');
        const { data: { errmsg, ticket }, } = res;
        if (errmsg) {
            common_1.Logger.error(`获取普通二维码ticket失败: ${errmsg}`, 'OfficialService');
            throw new common_1.HttpException(errmsg, common_1.HttpStatus.BAD_REQUEST);
        }
        common_1.Logger.log(`普通二维码ticket获取成功: ${ticket.substring(0, 20)}...`, 'OfficialService');
        return ticket;
    }
    async loginByCode(req, code) {
        const appId = await this.globalConfigService.getConfigs(['wechatOfficialAppId']);
        const secret = await this.globalConfigService.getConfigs(['wechatOfficialAppSecret']);
        const Url = (0, utils_1.formatUrl)(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
        const res = await axios_1.default.get(`${Url}/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${code}&grant_type=authorization_code`);
        const { data: { errmsg, openid, access_token }, } = res;
        if (errmsg)
            throw new common_1.HttpException(errmsg, common_1.HttpStatus.BAD_REQUEST);
        if (openid) {
            let user;
            user = await this.userService.getUserOpenId(openid);
            if (!user) {
                user = await this.userService.getUserFromOpenId(openid);
            }
            const userInfo = await axios_1.default.get(`${Url}/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`);
            await this.userService.updateUserInfo(user.id, userInfo.data);
            common_1.Logger.log(`微信授权登录成功 - OpenID: ${openid}, UserID: ${user.id}`, 'OfficialService');
            return this.authService.loginByOpenId(user, req);
        }
    }
    async scan(openID, sceneStr) {
        try {
            common_1.Logger.debug(`处理扫码事件 - OpenID: ${openID}, SceneStr: ${sceneStr}`, 'OfficialService');
            if (!this.sceneStrMap[sceneStr]) {
                common_1.Logger.error(`非法扫码请求 - 未找到的sceneStr: ${sceneStr}`, 'OfficialService');
                throw new common_1.HttpException('非法参数', common_1.HttpStatus.BAD_REQUEST);
            }
            common_1.Logger.debug(`sceneStrMap中存在key [${sceneStr}]`, 'OfficialService');
            const user = await this.userService.getUserFromOpenId(openID, sceneStr);
            common_1.Logger.debug(`扫码用户信息 - OpenID: ${openID}, UserID: ${user?.id || '未找到'}`, 'OfficialService');
            this.scanedSceneStrMap[sceneStr] = user.id;
            common_1.Logger.debug(`更新scanedSceneStrMap, 设置[${sceneStr}] = ${user.id}`, 'OfficialService');
            common_1.Logger.log(`用户扫码成功 - OpenID: ${openID}, UserID: ${user?.id || '未找到'}, SceneStr: ${sceneStr}`, 'OfficialService');
        }
        catch (error) {
            common_1.Logger.error(`扫码处理失败 - OpenID: ${openID}, Error: ${error.message}`, 'OfficialService');
            throw new common_1.HttpException('处理扫码事件时发生错误', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async loginBySceneStr(req, body) {
        const { sceneStr } = body;
        common_1.Logger.debug(`轮询扫码登录 - SceneStr: ${sceneStr}`, 'OfficialService');
        common_1.Logger.debug(`当前scanedSceneStrMap状态检查`, 'OfficialService');
        if (!this.sceneStrMap[sceneStr]) {
            common_1.Logger.debug(`sceneStr [${sceneStr}] 不存在于sceneStrMap中`, 'OfficialService');
            return;
        }
        const userId = this.scanedSceneStrMap[sceneStr];
        if (!userId) {
            common_1.Logger.debug(`userId不存在于scanedSceneStrMap[${sceneStr}]中`, 'OfficialService');
            return '';
        }
        common_1.Logger.debug(`找到匹配的userId: ${userId}`, 'OfficialService');
        const user = await this.userService.getUserById(userId);
        common_1.Logger.log(`扫码登录成功 - UserID: ${userId}, SceneStr: ${sceneStr}`, 'OfficialService');
        delete this.scanedSceneStrMap[sceneStr];
        common_1.Logger.debug(`从scanedSceneStrMap中删除 [${sceneStr}]`, 'OfficialService');
        return this.authService.loginByOpenId(user, req);
    }
    async scanBindWx(openId, sceneStr) {
        common_1.Logger.debug(`处理绑定微信扫码 - OpenID: ${openId}, SceneStr: ${sceneStr}`, 'OfficialService');
        if (!this.sceneStrMap[sceneStr]) {
            common_1.Logger.error(`非法参数 - sceneStr [${sceneStr}] 不在sceneStrMap中`, 'OfficialService');
            throw new common_1.HttpException('非法参数', common_1.HttpStatus.BAD_REQUEST);
        }
        const userId = sceneStr.split('/')[1];
        common_1.Logger.debug(`解析的UserID: ${userId}`, 'OfficialService');
        const bindRes = await this.userService.bindWx(openId, userId);
        this.scanedSceneStrMap[sceneStr] = bindRes;
        common_1.Logger.debug(`更新scanedSceneStrMap, 设置[${sceneStr}]`, 'OfficialService');
        common_1.Logger.log(`微信绑定成功 - OpenID: ${openId}, UserID: ${userId}`, 'OfficialService');
        return bindRes;
    }
    async bindWxBySceneStr(req, sceneStr) {
        if (!this.sceneStrMap[sceneStr])
            throw new common_1.HttpException('非法参数', common_1.HttpStatus.BAD_REQUEST);
        const { id } = req.user;
        const res = this.scanedSceneStrMap[sceneStr];
        if (!res)
            return '';
        delete this.scanedSceneStrMap[sceneStr];
        common_1.Logger.log(`微信绑定确认 - UserID: ${id}, SceneStr: ${sceneStr}`, 'OfficialService');
        return res;
    }
    async verify(signature, nonce, timestamp) {
        const token = (await this.globalConfigService.getConfigs(['wechatOfficialToken'])) || '';
        return (await this.sha1([token, nonce, timestamp].sort().join(''))) == signature;
    }
    sha1(data) {
        return crypto.createHash('sha1').update(data).digest('hex');
    }
    async genXmlMsgByConfig(xmlData, msgKey) {
        const msg = await this.globalConfigService.getConfigs([msgKey]);
        common_1.Logger.debug(`使用配置消息 [${msgKey}]`, 'OfficialService');
        return this.genXmlMsg(xmlData, msg);
    }
    async genXmlMsg(xmlData, msg) {
        const getXmlValue = field => {
            const fieldLower = field.toLowerCase();
            if (xmlData[field] !== undefined) {
                return Array.isArray(xmlData[field]) ? xmlData[field][0] : xmlData[field];
            }
            if (xmlData[fieldLower] !== undefined) {
                return Array.isArray(xmlData[fieldLower]) ? xmlData[fieldLower][0] : xmlData[fieldLower];
            }
            return null;
        };
        const fromUser = getXmlValue('FromUserName') || getXmlValue('fromusername');
        const toUser = getXmlValue('ToUserName') || getXmlValue('tousername');
        common_1.Logger.debug(`生成XML回复, 发送给: ${fromUser}, 来自: ${toUser}`, 'OfficialService');
        if (!fromUser) {
            common_1.Logger.error(`缺少FromUserName字段: ${JSON.stringify(xmlData)}`, 'OfficialService');
            throw new common_1.HttpException('缺少必要的XML字段', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!toUser) {
            common_1.Logger.error(`缺少ToUserName字段: ${JSON.stringify(xmlData)}`, 'OfficialService');
            throw new common_1.HttpException('缺少必要的XML字段', common_1.HttpStatus.BAD_REQUEST);
        }
        const xmlResponse = `
    <xml>
        <ToUserName><![CDATA[${fromUser}]]></ToUserName>
        <FromUserName><![CDATA[${toUser}]]></FromUserName>
        <CreateTime>${new Date().getTime()}</CreateTime>
        <MsgType><![CDATA[text]]></MsgType>
        <Content><![CDATA[${msg}]]></Content>
    </xml>`;
        common_1.Logger.debug(`生成的XML回复已完成`, 'OfficialService');
        return xmlResponse;
    }
    async createMenu(menuData) {
        try {
            const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
            const Url = (0, utils_1.formatUrl)(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
            const res = await axios_1.default.post(`${Url}/cgi-bin/menu/create?access_token=${accessToken}`, menuData);
            const { data } = res;
            common_1.Logger.log(`创建自定义菜单成功`, 'OfficialService');
            return data;
        }
        catch (error) {
            common_1.Logger.error(`创建自定义菜单失败: ${error.message}`, 'OfficialService');
            throw new common_1.HttpException(error.response?.data?.errmsg || '创建自定义菜单失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getMenu() {
        try {
            const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
            const Url = (0, utils_1.formatUrl)(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
            const res = await axios_1.default.get(`${Url}/cgi-bin/menu/get?access_token=${accessToken}`);
            const { data } = res;
            common_1.Logger.log(`查询自定义菜单成功: ${JSON.stringify(data)}`, 'OfficialService');
            common_1.Logger.log(`查询自定义菜单成功`, 'OfficialService');
            return data;
        }
        catch (error) {
            common_1.Logger.error(`查询自定义菜单失败: ${error.message}`, 'OfficialService');
            throw new common_1.HttpException(error.response?.data?.errmsg || '查询自定义菜单失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async deleteMenu() {
        try {
            const accessToken = await this.globalConfigService.getConfigs(['wechatAccessToken']);
            const Url = (0, utils_1.formatUrl)(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
            const res = await axios_1.default.get(`${Url}/cgi-bin/menu/delete?access_token=${accessToken}`);
            const { data } = res;
            common_1.Logger.log(`删除自定义菜单成功`, 'OfficialService');
            return data;
        }
        catch (error) {
            common_1.Logger.error(`删除自定义菜单失败: ${error.message}`, 'OfficialService');
            throw new common_1.HttpException(error.response?.data?.errmsg || '删除自定义菜单失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async bindWxByOldWechat(req, sceneStr) {
        try {
            common_1.Logger.log(`开始处理旧账号迁移 - SceneStr: ${sceneStr}`, 'OfficialService');
            if (!this.sceneStrMap[sceneStr]) {
                common_1.Logger.log(`非法参数 - sceneStr [${sceneStr}] 不在sceneStrMap中`, 'OfficialService');
                throw new common_1.HttpException('非法参数', common_1.HttpStatus.BAD_REQUEST);
            }
            const { id: currentUserId } = req.user;
            common_1.Logger.log(`当前用户ID: ${currentUserId}`, 'OfficialService');
            const openidData = this.scanedSceneStrMap[sceneStr];
            if (!openidData) {
                common_1.Logger.log(`未找到关联的旧OpenID数据 - sceneStr: ${sceneStr}`, 'OfficialService');
                return '';
            }
            const oldOpenId = openidData.openid;
            if (!oldOpenId) {
                common_1.Logger.log(`旧OpenID数据格式错误 - 数据: ${JSON.stringify(openidData)}`, 'OfficialService');
                throw new common_1.HttpException('无效的OpenID数据', common_1.HttpStatus.BAD_REQUEST);
            }
            const oldUser = await this.userService.getUserOpenId(oldOpenId);
            if (!oldUser) {
                common_1.Logger.log(`未找到使用旧OpenID的用户 - OpenID: ${oldOpenId}`, 'OfficialService');
                return {
                    success: false,
                    message: '未找到旧账号，迁移失败',
                };
            }
            const currentUser = await this.userService.getUserById(currentUserId);
            if (!currentUser) {
                common_1.Logger.log(`未找到当前用户 - ID: ${currentUserId}`, 'OfficialService');
                throw new common_1.HttpException('当前用户不存在', common_1.HttpStatus.BAD_REQUEST);
            }
            const currentOpenId = currentUser.openId;
            if (!currentOpenId) {
                common_1.Logger.log(`当前用户未绑定微信 - ID: ${currentUserId}`, 'OfficialService');
                throw new common_1.HttpException('当前用户未绑定微信', common_1.HttpStatus.BAD_REQUEST);
            }
            common_1.Logger.log(`找到旧账号信息 - 旧用户ID: ${oldUser.id}, 旧OpenID: ${oldOpenId}`, 'OfficialService');
            common_1.Logger.log(`当前用户信息 - 用户ID: ${currentUserId}, OpenID: ${currentOpenId}`, 'OfficialService');
            const updateOldResult = await this.userService.updateUserOpenId(oldUser.id, currentOpenId);
            if (!updateOldResult.status) {
                common_1.Logger.log(`更新旧账号OpenID失败: ${updateOldResult.msg}`, 'OfficialService');
                return {
                    success: false,
                    message: `更新旧账号时出错: ${updateOldResult.msg}`,
                };
            }
            common_1.Logger.log(`成功更新旧账号OpenID - 用户ID: ${oldUser.id}, 新OpenID: ${currentOpenId}`, 'OfficialService');
            const updateCurrentResult = await this.userService.updateUserOpenId(currentUserId, null);
            if (!updateCurrentResult.status) {
                common_1.Logger.log(`清空当前账号OpenID失败: ${updateCurrentResult.msg}`, 'OfficialService');
                common_1.Logger.log(`尝试回滚旧账号OpenID更新`, 'OfficialService');
                const rollbackResult = await this.userService.updateUserOpenId(oldUser.id, oldOpenId);
                if (!rollbackResult.status) {
                    common_1.Logger.log(`回滚失败，旧账号状态可能已损坏: ${rollbackResult.msg}`, 'OfficialService');
                }
                return {
                    success: false,
                    message: `清空当前账号时出错: ${updateCurrentResult.msg}`,
                };
            }
            common_1.Logger.log(`成功清空当前账号OpenID - 用户ID: ${currentUserId}`, 'OfficialService');
            delete this.scanedSceneStrMap[sceneStr];
            common_1.Logger.log(`从scanedSceneStrMap中删除 [${sceneStr}]`, 'OfficialService');
            return {
                success: true,
                message: '账号迁移成功，现在可以使用旧账号登录',
                needRelogin: true,
            };
        }
        catch (error) {
            common_1.Logger.log(`旧账号迁移处理失败: ${error.message}`, 'OfficialService');
            throw new common_1.HttpException('处理账号迁移时发生错误', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async scanOldWechat(openId, sceneStr) {
        common_1.Logger.debug(`处理旧账号微信扫码 - OpenID: ${openId}, SceneStr: ${sceneStr}`, 'OfficialService');
        if (!this.sceneStrMap[sceneStr]) {
            common_1.Logger.error(`非法参数 - sceneStr [${sceneStr}] 不在sceneStrMap中`, 'OfficialService');
            throw new common_1.HttpException('非法参数', common_1.HttpStatus.BAD_REQUEST);
        }
        const oldOpenId = openId;
        const oldUser = await this.userService.getUserOpenId(oldOpenId);
        if (!oldUser) {
            common_1.Logger.warn(`未找到使用该OpenID的旧账号 - OpenID: ${oldOpenId}`, 'OfficialService');
            this.scanedSceneStrMap[sceneStr] = {
                success: false,
                error: 'not_found',
                message: '未找到绑定此微信的旧账号',
            };
            return 'not_found';
        }
        common_1.Logger.debug(`找到使用该OpenID的旧账号 - UserID: ${oldUser.id}`, 'OfficialService');
        this.scanedSceneStrMap[sceneStr] = {
            success: true,
            openid: oldOpenId,
            userId: oldUser.id,
        };
        common_1.Logger.log(`旧账号关联成功 - OpenID: ${oldOpenId}, UserID: ${oldUser.id}`, 'OfficialService');
        return true;
    }
    async getQRSceneStrByOldWechat(req) {
        const { id } = req.user;
        common_1.Logger.log(`为用户${id}生成旧账号迁移sceneStr`, 'OfficialService');
        const sceneStr = `${(0, utils_1.createRandomNonceStr)(32)}#${id}`;
        common_1.Logger.log(`生成的sceneStr: ${sceneStr}`, 'OfficialService');
        this.sceneStrMap[sceneStr] = true;
        common_1.Logger.log(`已将sceneStr加入sceneStrMap`, 'OfficialService');
        return sceneStr;
    }
    async getOldQRCodeTicket(sceneStr) {
        common_1.Logger.log(`开始获取旧公众号二维码ticket，sceneStr: ${sceneStr}`, 'OfficialService');
        if (!this.sceneStrMap[sceneStr]) {
            common_1.Logger.log(`将sceneStr添加到sceneStrMap: ${sceneStr}`, 'OfficialService');
            this.sceneStrMap[sceneStr] = true;
        }
        const oldAccessToken = await this.globalConfigService.getConfigs(['oldWechatAccessToken']);
        if (!oldAccessToken) {
            common_1.Logger.error('无法获取旧公众号访问令牌', 'OfficialService');
            throw new common_1.HttpException('无法获取旧公众号访问令牌', common_1.HttpStatus.BAD_REQUEST);
        }
        common_1.Logger.log(`成功获取旧公众号access_token: ${oldAccessToken.substring(0, 10)}...`, 'OfficialService');
        const ticket = await this.fetchQRCodeTicketWithToken(sceneStr, oldAccessToken);
        common_1.Logger.log(`成功获取旧公众号ticket: ${ticket.substring(0, 15)}...`, 'OfficialService');
        return ticket;
    }
    async fetchQRCodeTicketWithToken(sceneStr, accessToken) {
        try {
            const Url = (0, utils_1.formatUrl)(process.env.weChatApiUrl || 'https://api.weixin.qq.com');
            const params = {
                action_name: 'QR_STR_SCENE',
                action_info: { scene: { scene_str: sceneStr } },
            };
            common_1.Logger.log(`创建二维码请求 - URL: ${Url}/cgi-bin/qrcode/create, token: ${accessToken.substring(0, 10)}...`, 'OfficialService');
            common_1.Logger.log(`请求参数: ${JSON.stringify(params)}`, 'OfficialService');
            const res = await axios_1.default.post(`${Url}/cgi-bin/qrcode/create?access_token=${accessToken}`, params);
            common_1.Logger.log(`二维码创建响应: ${JSON.stringify(res.data)}`, 'OfficialService');
            const { data: { errmsg, ticket, errcode }, } = res;
            if (errmsg || errcode) {
                common_1.Logger.error(`创建二维码失败 - 错误码: ${errcode}, 错误信息: ${errmsg}`, 'OfficialService');
                throw new common_1.HttpException(errmsg || '创建二维码失败', common_1.HttpStatus.BAD_REQUEST);
            }
            if (!ticket) {
                common_1.Logger.error('创建二维码失败 - 未返回ticket', 'OfficialService');
                throw new common_1.HttpException('未获取到二维码ticket', common_1.HttpStatus.BAD_REQUEST);
            }
            return ticket;
        }
        catch (error) {
            common_1.Logger.error(`创建二维码异常: ${error.message}`, 'OfficialService');
            throw new common_1.HttpException(error.message || '创建二维码失败', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.OfficialService = OfficialService;
exports.OfficialService = OfficialService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof autoReply_service_1.AutoReplyService !== "undefined" && autoReply_service_1.AutoReplyService) === "function" ? _a : Object, typeof (_b = typeof user_service_1.UserService !== "undefined" && user_service_1.UserService) === "function" ? _b : Object, typeof (_c = typeof auth_service_1.AuthService !== "undefined" && auth_service_1.AuthService) === "function" ? _c : Object, typeof (_d = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _d : Object, typeof (_e = typeof chat_service_1.ChatService !== "undefined" && chat_service_1.ChatService) === "function" ? _e : Object])
], OfficialService);


/***/ }),
/* 219 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OrderModule = void 0;
const cramiPackage_entity_1 = __webpack_require__(71);
const common_1 = __webpack_require__(2);
const order_controller_1 = __webpack_require__(220);
const order_service_1 = __webpack_require__(221);
const order_entity_1 = __webpack_require__(201);
const typeorm_1 = __webpack_require__(33);
const user_entity_1 = __webpack_require__(83);
let OrderModule = class OrderModule {
};
exports.OrderModule = OrderModule;
exports.OrderModule = OrderModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([order_entity_1.OrderEntity, cramiPackage_entity_1.CramiPackageEntity, user_entity_1.UserEntity])],
        controllers: [order_controller_1.OrderController],
        providers: [order_service_1.OrderService],
    })
], OrderModule);


/***/ }),
/* 220 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OrderController = void 0;
const superAuth_guard_1 = __webpack_require__(103);
const jwtAuth_guard_1 = __webpack_require__(87);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const order_service_1 = __webpack_require__(221);
const express_1 = __webpack_require__(104);
const buy_dto_1 = __webpack_require__(223);
const queryByOrder_dto_1 = __webpack_require__(224);
const adminAuth_guard_1 = __webpack_require__(86);
const queryAllOrder_dto_1 = __webpack_require__(225);
let OrderController = class OrderController {
    orderService;
    constructor(orderService) {
        this.orderService = orderService;
    }
    async buy(body, req) {
        return this.orderService.buy(body, req);
    }
    async queryByOrderId(req, query) {
        const { id: userId } = req.user;
        return this.orderService.queryByOrderId(req, query);
    }
    async queryAllOrder(query) {
        return this.orderService.queryAllOrder(query);
    }
    async deleteOrder(body) {
        return this.orderService.deleteOrder(body);
    }
    async deleteNotPay() {
        return this.orderService.deleteNotPay();
    }
};
exports.OrderController = OrderController;
__decorate([
    (0, common_1.Post)('buy'),
    (0, swagger_1.ApiOperation)({ summary: '购买商品' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof buy_dto_1.BuyDto !== "undefined" && buy_dto_1.BuyDto) === "function" ? _b : Object, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "buy", null);
__decorate([
    (0, common_1.Get)('queryByOrderId'),
    (0, swagger_1.ApiOperation)({ summary: '查询订单' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object, typeof (_e = typeof queryByOrder_dto_1.QueryByOrderIdDto !== "undefined" && queryByOrder_dto_1.QueryByOrderIdDto) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "queryByOrderId", null);
__decorate([
    (0, common_1.Get)('queryAll'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有订单' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof queryAllOrder_dto_1.QuerAllOrderDto !== "undefined" && queryAllOrder_dto_1.QuerAllOrderDto) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "queryAllOrder", null);
__decorate([
    (0, common_1.Post)('delete'),
    (0, swagger_1.ApiOperation)({ summary: '删除订单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof queryByOrder_dto_1.QueryByOrderIdDto !== "undefined" && queryByOrder_dto_1.QueryByOrderIdDto) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "deleteOrder", null);
__decorate([
    (0, common_1.Post)('deleteNotPay'),
    (0, swagger_1.ApiOperation)({ summary: '删除未支付订单' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OrderController.prototype, "deleteNotPay", null);
exports.OrderController = OrderController = __decorate([
    (0, swagger_1.ApiTags)('Order'),
    (0, common_1.Controller)('order'),
    __metadata("design:paramtypes", [typeof (_a = typeof order_service_1.OrderService !== "undefined" && order_service_1.OrderService) === "function" ? _a : Object])
], OrderController);


/***/ }),
/* 221 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OrderService = void 0;
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const cramiPackage_entity_1 = __webpack_require__(71);
const globalConfig_service_1 = __webpack_require__(74);
const pay_service_1 = __webpack_require__(222);
const user_entity_1 = __webpack_require__(83);
const order_entity_1 = __webpack_require__(201);
let OrderService = class OrderService {
    orderEntity;
    cramiPackageEntity;
    userEntity;
    payService;
    globalConfigService;
    constructor(orderEntity, cramiPackageEntity, userEntity, payService, globalConfigService) {
        this.orderEntity = orderEntity;
        this.cramiPackageEntity = cramiPackageEntity;
        this.userEntity = userEntity;
        this.payService = payService;
        this.globalConfigService = globalConfigService;
    }
    async buy(params, req) {
        try {
            const { goodsId, count = 1, payType } = params;
            const { id: userId } = req.user;
            if (userId > 1000000) {
                throw new common_1.HttpException('请先注册账号后购买商品！', common_1.HttpStatus.UNAUTHORIZED);
            }
            const order = await this.create(userId, goodsId, count, payType);
            common_1.Logger.debug('order: ', order);
            const res = await this.payService.pay(userId, order.orderId, payType);
            return {
                ...res,
                orderId: order.orderId,
                platform: order.payPlatform,
                total: order.total,
            };
        }
        catch (error) {
            if (error.status === 401) {
                throw new common_1.HttpException(error.message, common_1.HttpStatus.UNAUTHORIZED);
            }
            throw new common_1.HttpException(error.message || '购买失败!', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async queryByOrderId(req, params) {
        const { id: userId } = req.user;
        const { orderId } = params;
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        return order;
    }
    async create(userId, goodsId, count, payType) {
        const payPlatform = await this.globalConfigService.queryPayType();
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const doc = {};
        doc['orderId'] = (0, utils_1.createOrderId)();
        doc['userId'] = userId;
        doc['goodsId'] = goodsId;
        doc['price'] = Number(goods.price);
        doc['count'] = count;
        doc['total'] = Number(goods.price) * count;
        doc['payPlatform'] = payPlatform;
        doc['channel'] = payType;
        const order = await this.orderEntity.save(doc);
        console.log('order: ', order);
        return order;
    }
    async query(userId, page, size) {
        return await this.orderEntity.findAndCount({
            where: { userId },
            order: { id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
    }
    async queryAllOrder(params) {
        const { page, size, userId, platform, status } = params;
        const where = {};
        if (userId)
            where['userId'] = userId;
        if (platform)
            where['payPlatform'] = platform;
        if (status)
            where['status'] = status;
        const [rows, count] = await this.orderEntity.findAndCount({
            order: { id: 'DESC' },
            where,
            skip: (page - 1) * size,
            take: size,
        });
        const userIds = rows.map(item => item.userId);
        const goodsIds = rows.map(item => item.goodsId);
        const userInfos = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
            select: ['id', 'username', 'email'],
        });
        const goodsInfos = await this.cramiPackageEntity.find({
            where: { id: (0, typeorm_2.In)(goodsIds) },
            select: ['id', 'name', 'coverImg', 'des'],
        });
        rows.forEach((item) => {
            item.userInfo = userInfos.find(user => user.id === item.userId);
            item.goodsInfo = goodsInfos.find(goods => goods.id === item.goodsId);
        });
        const totalPrice = await this.orderEntity
            .createQueryBuilder('order')
            .where('order.status = :status', { status: 1 })
            .select('SUM(order.price)', 'total_price')
            .getRawOne();
        return { rows, count, ...totalPrice };
    }
    async deleteOrder(body) {
        const { orderId } = body;
        const o = await this.orderEntity.findOne({ where: { orderId } });
        if (!o) {
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.orderEntity.delete({ orderId });
    }
    async deleteNotPay() {
        return await this.orderEntity.delete({ status: 0 });
    }
};
exports.OrderService = OrderService;
exports.OrderService = OrderService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(order_entity_1.OrderEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(cramiPackage_entity_1.CramiPackageEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _c : Object, typeof (_d = typeof pay_service_1.PayService !== "undefined" && pay_service_1.PayService) === "function" ? _d : Object, typeof (_e = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _e : Object])
], OrderService);


/***/ }),
/* 222 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PayService = void 0;
const utils_1 = __webpack_require__(36);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const axios_1 = __webpack_require__(39);
const crypto = __webpack_require__(16);
const typeorm_2 = __webpack_require__(3);
const cramiPackage_entity_1 = __webpack_require__(71);
const globalConfig_service_1 = __webpack_require__(74);
const order_entity_1 = __webpack_require__(201);
const user_service_1 = __webpack_require__(97);
const userBalance_service_1 = __webpack_require__(34);
let PayService = class PayService {
    cramiPackageEntity;
    orderEntity;
    userBalanceService;
    globalConfigService;
    userService;
    constructor(cramiPackageEntity, orderEntity, userBalanceService, globalConfigService, userService) {
        this.cramiPackageEntity = cramiPackageEntity;
        this.orderEntity = orderEntity;
        this.userBalanceService = userBalanceService;
        this.globalConfigService = globalConfigService;
        this.userService = userService;
    }
    WxPay;
    async onModuleInit() {
        const wpay = await (0, utils_1.importDynamic)('wechatpay-node-v3');
        this.WxPay = wpay?.default ? wpay.default : wpay;
    }
    async notify(params) {
        if (params['param'] == 'epay') {
            return this.notifyEpay(params);
        }
        if (params['attach'] == 'hupi') {
            return this.notifyHupi(params);
        }
        if (params['attach'] == 'ltzf') {
            return this.notifyLtzf(params);
        }
        if (params['param'] == 'dulu') {
            return this.notifyDuluPay(params);
        }
        if (typeof params['resource'] == 'object') {
            return this.notifyWeChat(params);
        }
        return this.notifyMpay(params);
    }
    async pay(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        common_1.Logger.log('本次支付类型: ', order.payPlatform);
        try {
            if (order.payPlatform == 'wechat') {
                return this.payWeChat(userId, orderId, payType);
            }
            if (order.payPlatform == 'epay') {
                return this.payEpay(userId, orderId, payType);
            }
            if (order.payPlatform == 'dulu') {
                return this.payDulu(userId, orderId, payType);
            }
            if (order.payPlatform == 'mpay') {
                return this.payMpay(userId, orderId, payType);
            }
            if (order.payPlatform == 'hupi') {
                return this.payHupi(userId, orderId, payType);
            }
            if (order.payPlatform == 'ltzf') {
                return this.payLtzf(userId, orderId, payType);
            }
        }
        catch (error) {
            common_1.Logger.log('支付请求失败: ', error);
            throw new common_1.HttpException('支付请求失败!', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async query(orderId) {
        const order = await this.orderEntity.findOne({ where: { orderId } });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        return order;
    }
    async notifyHupi(params) {
        const payHupiSecret = await this.globalConfigService.getConfigs(['payHupiSecret']);
        const hash = params['hash'];
        delete params['hash'];
        if (this.sign(params, payHupiSecret) != hash)
            return 'failed';
        const order = await this.orderEntity.findOne({
            where: { orderId: params['trade_order_id'], status: 0 },
        });
        if (!order)
            return 'failed';
        await this.userBalanceService.addBalanceToOrder(order);
        const result = await this.orderEntity.update({ orderId: params['trade_order_id'] }, { status: 1, paydAt: new Date() });
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payHupi(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payHupiAppId, payHupiSecret, payHupiNotifyUrl, payHupiReturnUrl, payHupiGatewayUrl } = await this.globalConfigService.getConfigs([
            'payHupiAppId',
            'payHupiSecret',
            'payHupiNotifyUrl',
            'payHupiReturnUrl',
            'payHupiGatewayUrl',
        ]);
        const params = {};
        params['version'] = '1.1';
        params['appid'] = payHupiAppId;
        params['time'] = (Date.now() / 1000).toFixed(0);
        params['nonce_str'] = (0, utils_1.createRandomNonceStr)(32);
        params['trade_order_id'] = orderId;
        params['title'] = goods.name;
        params['total_fee'] = order.total;
        params['notify_url'] = payHupiNotifyUrl;
        params['return_url'] = payHupiReturnUrl;
        params['attach'] = 'hupi';
        params['hash'] = this.sign(params, payHupiSecret);
        const { data: { errcode, errmsg, url_qrcode, url }, } = await axios_1.default.post(payHupiGatewayUrl || 'https://api.xunhupay.com/payment/do.html', params);
        if (errcode != 0)
            throw new common_1.HttpException(errmsg, common_1.HttpStatus.BAD_REQUEST);
        return { url_qrcode, url };
    }
    async queryHupi(orderId) {
        const { payHupiAppId, payHupiSecret } = await this.globalConfigService.getConfigs([
            'payHupiAppId',
            'payHupiSecret',
        ]);
        const params = {};
        params['version'] = '1.1';
        params['appid'] = payHupiAppId;
        params['time'] = (Date.now() / 1000).toFixed(0);
        params['nonce_str'] = (0, utils_1.createRandomNonceStr)(32);
        params['out_trade_order'] = orderId;
        params['hash'] = this.sign(params, payHupiSecret);
        const { data: { errcode, errmsg, data: result }, } = await axios_1.default.post('https://api.xunhupay.com/payment/query.html', params);
        if (errcode != 0)
            throw new common_1.HttpException(errmsg, common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyEpay(params) {
        const sign = params['sign'];
        delete params['sign'];
        delete params['sign_type'];
        const payEpaySecret = await this.globalConfigService.getConfigs(['payEpaySecret']);
        if (this.sign(params, payEpaySecret) != sign)
            return 'failed';
        common_1.Logger.log('校验签名通过');
        const order = await this.orderEntity.findOne({
            where: { orderId: params['out_trade_no'], status: 0 },
        });
        if (!order)
            return 'failed';
        const status = params['trade_status'] == 'TRADE_SUCCESS' ? 1 : 2;
        const result = await this.orderEntity.update({ orderId: params['out_trade_no'] }, { status, paydAt: new Date() });
        if (status === 1) {
            await this.userBalanceService.addBalanceToOrder(order);
        }
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payEpay(userId, orderId, payType = 'alipay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payEpayPid, payEpaySecret, payEpayNotifyUrl, payEpayReturnUrl, payEpayApiPayUrl } = await this.globalConfigService.getConfigs([
            'payEpayPid',
            'payEpaySecret',
            'payEpayNotifyUrl',
            'payEpayReturnUrl',
            'payEpayApiPayUrl',
        ]);
        let convertedNumber;
        if (payEpayPid.length <= 16) {
            convertedNumber = Number(payEpayPid);
        }
        else {
            convertedNumber = BigInt(payEpayPid);
        }
        const params = {};
        params['pid'] = convertedNumber;
        params['type'] = payType;
        params['out_trade_no'] = orderId;
        params['name'] = goods.name;
        params['money'] = order.total;
        params['clientip'] = '192.168.1.100';
        params['device'] = 'pc';
        params['notify_url'] = payEpayNotifyUrl;
        params['return_url'] = payEpayReturnUrl;
        params['param'] = 'epay';
        params['sign'] = this.sign(params, payEpaySecret);
        params['sign_type'] = 'MD5';
        const queryParams = new URLSearchParams(params).toString();
        const apiUrl = `${payEpayApiPayUrl}?${queryParams}`;
        if (payEpayApiPayUrl.includes('submit.php')) {
            return {
                url_qrcode: null,
                redirectUrl: apiUrl,
                channel: payType,
                isRedirect: true,
            };
        }
        else {
            const config = {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            };
            const res = await axios_1.default.post(payEpayApiPayUrl, params, config);
            common_1.Logger.log('epay ---> res: ', res.data);
            const { data: { code, msg, qrcode: url_qrcode }, } = res;
            if (code != 1)
                throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
            return {
                url_qrcode,
                redirectUrl: null,
                channel: payType,
                isRedirect: false,
            };
        }
    }
    async queryEpay(orderId) {
        const { payEpayPid, payEpaySecret, payEpayApiQueryUrl } = await this.globalConfigService.getConfigs([
            'payEpayPid',
            'payEpaySecret',
            'payEpayApiQueryUrl',
        ]);
        const params = {};
        params['act'] = 'order';
        params['out_trade_no'] = orderId;
        params['pid'] = payEpayPid;
        params['key'] = payEpaySecret;
        const { data: { code, msg, data: result }, } = await axios_1.default.get(payEpayApiQueryUrl, { params });
        if (code != 1)
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyDuluPay(params) {
        const sign = params['sign'];
        delete params['sign'];
        delete params['sign_type'];
        const payDuluPaySecret = await this.globalConfigService.getConfigs(['payDuluPaySecret']);
        if (this.sign(params, payDuluPaySecret) != sign)
            return 'failed';
        common_1.Logger.log('校验签名通过');
        const order = await this.orderEntity.findOne({
            where: { orderId: params['out_trade_no'], status: 0 },
        });
        if (!order)
            return 'failed';
        const status = params['trade_status'] == 'TRADE_SUCCESS' ? 1 : 2;
        const result = await this.orderEntity.update({ orderId: params['out_trade_no'] }, { status, paydAt: new Date() });
        if (status === 1) {
            await this.userBalanceService.addBalanceToOrder(order);
        }
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payDulu(userId, orderId, payType = 'alipay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payDuluPayPid, payDuluPaySecret, payDuluPayNotifyUrl, payDuluPayReturnUrl, payDuluPayRedirect, } = await this.globalConfigService.getConfigs([
            'payDuluPayPid',
            'payDuluPaySecret',
            'payDuluPayNotifyUrl',
            'payDuluPayReturnUrl',
            'payDuluPayRedirect',
        ]);
        let convertedNumber;
        if (payDuluPayPid.length <= 16) {
            convertedNumber = Number(payDuluPayPid);
        }
        else {
            convertedNumber = BigInt(payDuluPayPid);
        }
        const params = {};
        params['pid'] = convertedNumber;
        params['type'] = payType;
        params['out_trade_no'] = orderId;
        params['name'] = goods.name;
        params['money'] = order.total;
        params['clientip'] = '192.168.1.100';
        params['device'] = 'pc';
        params['notify_url'] = payDuluPayNotifyUrl;
        params['return_url'] = payDuluPayReturnUrl;
        params['param'] = 'dulu';
        params['sign'] = this.sign(params, payDuluPaySecret);
        params['sign_type'] = 'MD5';
        const queryParams = new URLSearchParams(params).toString();
        if (payDuluPayRedirect == 1) {
            return {
                url_qrcode: null,
                redirectUrl: `https://api.dulupay.com/submit.php?${queryParams}`,
                channel: payType,
                isRedirect: true,
            };
        }
        else {
            const config = {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            };
            const res = await axios_1.default.post('https://api.dulupay.com/mapi.php', params, config);
            common_1.Logger.log('dulu ---> res: ', res.data);
            const { data: { code, msg, qrcode: url_qrcode }, } = res;
            if (code != 1)
                throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
            return {
                url_qrcode,
                redirectUrl: null,
                channel: payType,
                isRedirect: false,
            };
        }
    }
    async queryDuluPay(orderId) {
        const { payDuluPayPid, payDuluPaySecret } = await this.globalConfigService.getConfigs([
            'payDuluPayPid',
            'payDuluPaySecret',
        ]);
        const params = {};
        params['act'] = 'order';
        params['out_trade_no'] = orderId;
        params['pid'] = payDuluPayPid;
        params['key'] = payDuluPaySecret;
        const { data: { code, msg, data: result }, } = await axios_1.default.get('https://api.dulupay.com', { params });
        if (code != 1)
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyMpay(params) {
        const sign = params['sign'];
        delete params['sign'];
        delete params['sign_type'];
        const payMpaySecret = await this.globalConfigService.getConfigs(['payMpaySecret']);
        common_1.Logger.log('校验签名');
        if (this.sign(params, payMpaySecret) != sign)
            return 'failed';
        common_1.Logger.log('校验签名通过');
        const order = await this.orderEntity.findOne({
            where: { orderId: params['out_trade_no'], status: 0 },
        });
        if (!order)
            return 'failed';
        const status = params['trade_status'] == 'TRADE_SUCCESS' ? 1 : 2;
        common_1.Logger.log('status: ', status);
        const result = await this.orderEntity.update({ orderId: params['out_trade_no'] }, { status, paydAt: new Date() });
        if (status === 1) {
            await this.userBalanceService.addBalanceToOrder(order);
        }
        if (result.affected != 1)
            return 'failed';
        return 'success';
    }
    async payMpay(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payMpayPid, payMpaySecret, payMpayNotifyUrl, payMpayReturnUrl, payMpayApiPayUrl } = await this.globalConfigService.getConfigs([
            'payMpayPid',
            'payMpaySecret',
            'payMpayNotifyUrl',
            'payMpayReturnUrl',
            'payMpayApiPayUrl',
        ]);
        const params = {};
        params['pid'] = Number(payMpayPid);
        params['type'] = payType;
        params['out_trade_no'] = orderId;
        params['name'] = goods.name;
        params['money'] = order.total;
        params['notify_url'] = payMpayNotifyUrl;
        params['return_url'] = payMpayReturnUrl;
        params['sign'] = this.sign(params, payMpaySecret);
        params['sign_type'] = 'MD5';
        const queryParams = new URLSearchParams(params).toString();
        const apiUrl = `${payMpayApiPayUrl}?${queryParams}`;
        return {
            url_qrcode: null,
            redirectUrl: apiUrl,
            channel: payType,
            isRedirect: true,
        };
        const res = await axios_1.default.get(payMpayApiPayUrl, { params });
    }
    async queryMpay(orderId) {
        const { payMpayApiQueryUrl } = await this.globalConfigService.getConfigs([
            'payMpayPid',
            'payMpaySecret',
            'payMpayApiQueryUrl',
        ]);
        const params = {};
        params['type'] = 2;
        params['order_no'] = orderId;
        const { data: { code, msg, data: result }, } = await axios_1.default.get(payMpayApiQueryUrl, { params });
        if (code != 1)
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyWeChat(params) {
        common_1.Logger.log('微信支付通知params: ', params);
        const { payWeChatAppId, payWeChatMchId, payWeChatSecret, payWeChatPublicKey, payWeChatPrivateKey, } = await this.globalConfigService.getConfigs([
            'payWeChatAppId',
            'payWeChatMchId',
            'payWeChatSecret',
            'payWeChatPublicKey',
            'payWeChatPrivateKey',
        ]);
        const pay = new this.WxPay({
            appid: payWeChatAppId,
            mchid: payWeChatMchId,
            publicKey: payWeChatPublicKey,
            privateKey: payWeChatPrivateKey,
        });
        try {
            if (params['event_type'] == 'TRANSACTION.SUCCESS') {
                const { ciphertext, associated_data, nonce } = params['resource'];
                const resource = pay.decipher_gcm(ciphertext, associated_data, nonce, payWeChatSecret);
                const order = await this.orderEntity.findOne({
                    where: { orderId: resource['out_trade_no'], status: 0 },
                });
                if (!order)
                    return 'failed';
                const status = resource['trade_state'] == 'SUCCESS' ? 1 : 2;
                const result = await this.orderEntity.update({ orderId: resource['out_trade_no'] }, { status, paydAt: new Date() });
                if (status === 1) {
                    await this.userBalanceService.addBalanceToOrder(order);
                }
                if (result.affected != 1)
                    return 'failed';
            }
            return 'success';
        }
        catch (error) {
            common_1.Logger.log('error: ', error);
            common_1.Logger.log('支付通知验证失败: ', error);
            return 'failed';
        }
    }
    async payWeChat(userId, orderId, payType = 'native') {
        common_1.Logger.log('payType: ', payType);
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payWeChatAppId, payWeChatMchId, payWeChatPublicKey, payWeChatPrivateKey, payWeChatNotifyUrl, } = await this.globalConfigService.getConfigs([
            'payWeChatAppId',
            'payWeChatMchId',
            'payWeChatPublicKey',
            'payWeChatPrivateKey',
            'payWeChatNotifyUrl',
        ]);
        const pay = new this.WxPay({
            appid: payWeChatAppId,
            mchid: payWeChatMchId,
            publicKey: payWeChatPublicKey,
            privateKey: payWeChatPrivateKey,
        });
        const params = {
            appid: payWeChatAppId,
            mchid: payWeChatMchId,
            description: goods.name,
            out_trade_no: orderId,
            notify_url: payWeChatNotifyUrl,
            amount: {
                total: Math.round(order.total * 100),
            },
        };
        common_1.Logger.log('wechat-pay: ', params);
        if (payType == 'jsapi') {
            common_1.Logger.log(`[WeChat Pay JSAPI] 开始JSAPI支付流程，用户ID: ${userId}, 订单ID: ${orderId}`);
            const openid = await this.userService.getOpenIdByUserId(userId);
            common_1.Logger.log(`[WeChat Pay JSAPI] 用户OpenID: ${openid}`);
            params['payer'] = { openid: openid };
            common_1.Logger.log(`[WeChat Pay JSAPI] 发送支付请求参数: `, JSON.stringify(params, null, 2));
            try {
                const response = await pay.transactions_jsapi(params);
                const result = response.data ? response.data : response;
                common_1.Logger.log(`[WeChat Pay JSAPI] 支付请求成功，返回结果: `, JSON.stringify(result, null, 2));
                return {
                    status: response.status || 'unknown',
                    appId: result.appId || result.data?.appId,
                    timeStamp: result.timeStamp || result.data?.timeStamp,
                    nonceStr: result.nonceStr || result.data?.nonceStr,
                    package: result.package || result.data?.package,
                    signType: result.signType || result.data?.signType,
                    paySign: result.paySign || result.data?.paySign,
                };
            }
            catch (error) {
                console.error(`[WeChat Pay JSAPI] 支付请求过程中发生错误: ${error.message}`, error);
                console.error('[WeChat Pay JSAPI] 完整的错误对象：', error);
                throw new common_1.HttpException('JSAPI支付失败', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        if (payType == 'native') {
            common_1.Logger.log(`开始进行微信Native支付流程，订单ID: ${orderId}, 用户ID: ${userId}`);
            try {
                const res = await pay.transactions_native(params);
                common_1.Logger.log(`微信Native支付响应数据: `, JSON.stringify(res, null, 2));
                const url_qrcode = res.code_url || res.data?.code_url;
                if (!url_qrcode) {
                    console.error(`微信Native支付请求成功，但未返回code_url，响应数据: `, JSON.stringify(res, null, 2));
                }
                else {
                    common_1.Logger.log(`微信Native支付请求成功，code_url: ${url_qrcode}`);
                }
                return { url_qrcode, isRedirect: false };
            }
            catch (error) {
                console.error(`微信Native支付过程中发生错误，错误信息: ${error.message}`, error);
                console.error('完整的错误对象：', error);
                throw new common_1.HttpException('微信Native支付失败', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        else {
            console.warn(`支付请求使用了不支持的支付类型: ${payType}`);
            throw new common_1.HttpException('unsupported pay type', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async queryWeChat(orderId) {
        const { payWeChatAppId, payWeChatMchId, payWeChatPublicKey, payWeChatPrivateKey, payWeChatNotifyUrl, } = await this.globalConfigService.getConfigs([
            'payWeChatAppId',
            'payWeChatMchId',
            'payWeChatPublicKey',
            'payWeChatPrivateKey',
        ]);
        const pay = new this.WxPay({
            appid: payWeChatAppId,
            mchid: payWeChatMchId,
            publicKey: payWeChatPublicKey,
            privateKey: payWeChatPrivateKey,
        });
        const result = await pay.query({ out_trade_no: orderId });
        return result;
    }
    sign(params, secret) {
        const str = Object.keys(params)
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&') + secret;
        return crypto.createHash('md5').update(str).digest('hex');
    }
    ltzfSign(params, secret) {
        const paramsArr = Object.keys(params);
        paramsArr.sort();
        const stringArr = [];
        paramsArr.map(key => {
            stringArr.push(key + '=' + params[key]);
        });
        stringArr.push('key=' + secret);
        const str = stringArr.join('&');
        return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
    }
    async payLtzf(userId, orderId, payType = 'wxpay') {
        const order = await this.orderEntity.findOne({
            where: { userId, orderId },
        });
        if (!order)
            throw new common_1.HttpException('订单不存在!', common_1.HttpStatus.BAD_REQUEST);
        const goods = await this.cramiPackageEntity.findOne({
            where: { id: order.goodsId },
        });
        if (!goods)
            throw new common_1.HttpException('套餐不存在!', common_1.HttpStatus.BAD_REQUEST);
        const { payLtzfMchId, payLtzfSecret, payLtzfNotifyUrl, payLtzfReturnUrl } = await this.globalConfigService.getConfigs([
            'payLtzfMchId',
            'payLtzfSecret',
            'payLtzfNotifyUrl',
            'payLtzfReturnUrl',
        ]);
        const params = {};
        params['mch_id'] = payLtzfMchId;
        params['timestamp'] = (Date.now() / 1000).toFixed(0);
        params['out_trade_no'] = orderId;
        params['body'] = goods.name;
        params['total_fee'] = order.total;
        params['notify_url'] = payLtzfNotifyUrl;
        params['sign'] = this.ltzfSign(params, payLtzfSecret);
        params['attach'] = 'ltzf';
        params['return_url'] = payLtzfReturnUrl;
        const formBody = Object.keys(params)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
            .join('&');
        const config = {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };
        const response = await axios_1.default.post('https://api.ltzf.cn/api/wxpay/jsapi_convenient', formBody, config);
        const { code, data, msg } = response.data;
        if (code != 0)
            throw new common_1.HttpException(msg, common_1.HttpStatus.BAD_REQUEST);
        const url_qrcode = data.QRcode_url;
        const url = data.order_url;
        return { url_qrcode, url };
    }
    async queryLtzf(orderId) {
        const { payLtzfMchId, payLtzfSecret } = await this.globalConfigService.getConfigs([
            'payLtzfMchId',
            'payLtzfSecret',
        ]);
        const params = {};
        params['mch_id'] = payLtzfMchId;
        params['timestamp'] = (Date.now() / 1000).toFixed(0);
        params['out_trade_no'] = orderId;
        params['sign'] = this.ltzfSign(params, payLtzfSecret);
        const formBody = Object.keys(params)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
            .join('&');
        const config = {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };
        const { data: { code, msg, data: result }, } = await axios_1.default.post('https://api.ltzf.cn/api/wxpay/get_pay_order', formBody, config);
        if (code != 0)
            throw new common_1.HttpException(msg + JSON.stringify(params), common_1.HttpStatus.BAD_REQUEST);
        return result;
    }
    async notifyLtzf(params) {
        const payLtzfSecret = await this.globalConfigService.getConfigs(['payLtzfSecret']);
        const hash = params['sign'];
        delete params['sign'];
        delete params['pay_channel'];
        delete params['trade_type'];
        delete params['success_time'];
        delete params['attach'];
        delete params['openid'];
        if (this.ltzfSign(params, payLtzfSecret) != hash)
            return 'FAIL';
        const order = await this.orderEntity.findOne({
            where: { orderId: params['out_trade_no'], status: 0 },
        });
        if (!order)
            return 'FAIL';
        await this.userBalanceService.addBalanceToOrder(order);
        const result = await this.orderEntity.update({ orderId: params['out_trade_no'] }, { status: 1, paydAt: new Date() });
        if (result.affected != 1)
            return 'FAIL';
        return 'SUCCESS';
    }
};
exports.PayService = PayService;
exports.PayService = PayService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(cramiPackage_entity_1.CramiPackageEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(order_entity_1.OrderEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof userBalance_service_1.UserBalanceService !== "undefined" && userBalance_service_1.UserBalanceService) === "function" ? _c : Object, typeof (_d = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _d : Object, typeof (_e = typeof user_service_1.UserService !== "undefined" && user_service_1.UserService) === "function" ? _e : Object])
], PayService);


/***/ }),
/* 223 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BuyDto = void 0;
const swagger_1 = __webpack_require__(14);
class BuyDto {
    goodsId;
    payType;
    count;
}
exports.BuyDto = BuyDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '要购买的套餐Id', required: true }),
    __metadata("design:type", Number)
], BuyDto.prototype, "goodsId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'wxpay', description: '付款方式', required: false }),
    __metadata("design:type", String)
], BuyDto.prototype, "payType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '购买数量', required: false }),
    __metadata("design:type", Number)
], BuyDto.prototype, "count", void 0);


/***/ }),
/* 224 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryByOrderIdDto = void 0;
const swagger_1 = __webpack_require__(14);
class QueryByOrderIdDto {
    orderId;
}
exports.QueryByOrderIdDto = QueryByOrderIdDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'qwdadadwe-qeqwfcadqw-gguytewj',
        description: '订单ID',
        required: false,
    }),
    __metadata("design:type", String)
], QueryByOrderIdDto.prototype, "orderId", void 0);


/***/ }),
/* 225 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuerAllOrderDto = void 0;
const class_validator_1 = __webpack_require__(110);
const swagger_1 = __webpack_require__(14);
class QuerAllOrderDto {
    page;
    size;
    userId;
    platform;
    status;
}
exports.QuerAllOrderDto = QuerAllOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '查询页数', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllOrderDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10, description: '每页数量', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllOrderDto.prototype, "size", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 99, description: '支付的用户id', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllOrderDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'epay', description: '支付的平台', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], QuerAllOrderDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '订单状态', required: false }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], QuerAllOrderDto.prototype, "status", void 0);


/***/ }),
/* 226 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PayModule = void 0;
const common_1 = __webpack_require__(2);
const pay_controller_1 = __webpack_require__(227);
const pay_service_1 = __webpack_require__(222);
const order_entity_1 = __webpack_require__(201);
const cramiPackage_entity_1 = __webpack_require__(71);
const typeorm_1 = __webpack_require__(33);
let PayModule = class PayModule {
};
exports.PayModule = PayModule;
exports.PayModule = PayModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([order_entity_1.OrderEntity, cramiPackage_entity_1.CramiPackageEntity])],
        controllers: [pay_controller_1.PayController],
        providers: [pay_service_1.PayService],
        exports: [pay_service_1.PayService],
    })
], PayModule);


/***/ }),
/* 227 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PayController = void 0;
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const pay_service_1 = __webpack_require__(222);
let PayController = class PayController {
    payService;
    constructor(payService) {
        this.payService = payService;
    }
    notifyHupi(body) {
        console.log('hupi ->body: ', body);
        return this.payService.notify(body);
    }
    notifyDuluPay(body) {
        console.log('dulu ->body: ', body);
        return this.payService.notify(body);
    }
    notifyLtzf(body) {
        console.log('ltzf ->body: ', body);
        return this.payService.notify(body);
    }
    notifyEpay(query) {
        console.log('epay ->query: ', query);
        return this.payService.notify(query);
    }
};
exports.PayController = PayController;
__decorate([
    (0, common_1.Post)('notify'),
    (0, swagger_1.ApiOperation)({ summary: 'hupi支付结果通知' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayController.prototype, "notifyHupi", null);
__decorate([
    (0, common_1.Post)('notify'),
    (0, swagger_1.ApiOperation)({ summary: 'Dulu支付结果通知' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayController.prototype, "notifyDuluPay", null);
__decorate([
    (0, common_1.Post)('notify'),
    (0, swagger_1.ApiOperation)({ summary: 'ltzf支付结果通知' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayController.prototype, "notifyLtzf", null);
__decorate([
    (0, common_1.Get)('notify'),
    (0, swagger_1.ApiOperation)({ summary: 'Epay支付结果通知' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PayController.prototype, "notifyEpay", null);
exports.PayController = PayController = __decorate([
    (0, common_1.Controller)('pay'),
    (0, swagger_1.ApiTags)('pay'),
    __metadata("design:paramtypes", [typeof (_a = typeof pay_service_1.PayService !== "undefined" && pay_service_1.PayService) === "function" ? _a : Object])
], PayController);


/***/ }),
/* 228 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PluginModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const plugin_controller_1 = __webpack_require__(229);
const plugin_entity_1 = __webpack_require__(159);
const plugin_service_1 = __webpack_require__(230);
let PluginModule = class PluginModule {
};
exports.PluginModule = PluginModule;
exports.PluginModule = PluginModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([plugin_entity_1.PluginEntity])],
        controllers: [plugin_controller_1.PluginController],
        providers: [plugin_service_1.PluginService],
    })
], PluginModule);


/***/ }),
/* 229 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PluginController = void 0;
const superAuth_guard_1 = __webpack_require__(103);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const plugin_service_1 = __webpack_require__(230);
let PluginController = class PluginController {
    pluginService;
    constructor(pluginService) {
        this.pluginService = pluginService;
    }
    pluginList(req) {
        return this.pluginService.pluginList(req);
    }
    createPlugin(body) {
        return this.pluginService.createPlugin(body);
    }
    updatePlugin(body) {
        return this.pluginService.updatePlugin(body);
    }
    delPlugin(body) {
        return this.pluginService.delPlugin(body);
    }
};
exports.PluginController = PluginController;
__decorate([
    (0, common_1.Get)('pluginList'),
    (0, swagger_1.ApiOperation)({ summary: '获取Plugin' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "pluginList", null);
__decorate([
    (0, common_1.Post)('createPlugin'),
    (0, swagger_1.ApiOperation)({ summary: '创建Plugin' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "createPlugin", null);
__decorate([
    (0, common_1.Post)('updatePlugin'),
    (0, swagger_1.ApiOperation)({ summary: '修改插件' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "updatePlugin", null);
__decorate([
    (0, common_1.Post)('delPlugin'),
    (0, swagger_1.ApiOperation)({ summary: '删除插件' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "delPlugin", null);
exports.PluginController = PluginController = __decorate([
    (0, swagger_1.ApiTags)('plugin'),
    (0, common_1.Controller)('plugin'),
    __metadata("design:paramtypes", [typeof (_a = typeof plugin_service_1.PluginService !== "undefined" && plugin_service_1.PluginService) === "function" ? _a : Object])
], PluginController);


/***/ }),
/* 230 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PluginService = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const models_service_1 = __webpack_require__(76);
const plugin_entity_1 = __webpack_require__(159);
let PluginService = class PluginService {
    PluginEntity;
    modelsService;
    constructor(PluginEntity, modelsService) {
        this.PluginEntity = PluginEntity;
        this.modelsService = modelsService;
    }
    async pluginList(query) {
        const { page = 1, size = 100 } = query;
        const rows = await this.PluginEntity.find({
            order: { sortOrder: 'ASC', id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const processedRows = await Promise.all(rows.map(async (plugin) => {
            try {
                const parameters = await this.modelsService.getCurrentModelKeyInfo(plugin.parameters);
                const deductType = parameters.deductType;
                const drawingType = parameters.drawingType;
                const modelType = parameters.keyType;
                return {
                    ...plugin,
                    deductType,
                    drawingType,
                    modelType,
                };
            }
            catch (error) {
                return {
                    ...plugin,
                    deductType: 0,
                    drawingType: 0,
                    modelType: 2,
                };
            }
        }));
        const filteredRows = processedRows.filter(plugin => plugin !== null);
        return { rows: filteredRows, count: filteredRows.length };
    }
    async createPlugin(body) {
        const { name, pluginImg, description, isEnabled, parameters, sortOrder } = body;
        const existingPlugin = await this.PluginEntity.findOne({
            where: { name },
        });
        if (existingPlugin) {
            throw new common_1.HttpException('该插件名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const newPlugin = this.PluginEntity.create({
            name,
            pluginImg,
            description,
            isEnabled: isEnabled !== undefined ? isEnabled : 1,
            parameters,
            sortOrder: sortOrder !== undefined ? sortOrder : 0,
        });
        return await this.PluginEntity.save(newPlugin);
    }
    async updatePlugin(body) {
        const { id, name, pluginImg, description, isEnabled, parameters, sortOrder } = body;
        const existingPlugin = await this.PluginEntity.findOne({
            where: { id },
        });
        if (!existingPlugin) {
            throw new common_1.HttpException('插件不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const duplicatePlugin = await this.PluginEntity.findOne({
            where: { name, id: (0, typeorm_2.Not)(id) },
        });
        if (duplicatePlugin) {
            throw new common_1.HttpException('该插件名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        existingPlugin.name = name;
        existingPlugin.pluginImg = pluginImg;
        existingPlugin.description = description;
        existingPlugin.isEnabled = isEnabled !== undefined ? isEnabled : existingPlugin.isEnabled;
        existingPlugin.parameters = parameters;
        existingPlugin.sortOrder = sortOrder !== undefined ? sortOrder : existingPlugin.sortOrder;
        await this.PluginEntity.save(existingPlugin);
        return '修改插件信息成功';
    }
    async delPlugin(body) {
        const { id } = body;
        const existingPlugin = await this.PluginEntity.findOne({
            where: { id },
        });
        if (!existingPlugin) {
            throw new common_1.HttpException('该插件不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const deleteResult = await this.PluginEntity.delete(id);
        if (deleteResult.affected > 0) {
            return '删除插件成功';
        }
        else {
            throw new common_1.HttpException('删除插件失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.PluginService = PluginService;
exports.PluginService = PluginService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(plugin_entity_1.PluginEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof models_service_1.ModelsService !== "undefined" && models_service_1.ModelsService) === "function" ? _b : Object])
], PluginService);


/***/ }),
/* 231 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ShareModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const share_controller_1 = __webpack_require__(232);
const share_entity_1 = __webpack_require__(202);
const share_service_1 = __webpack_require__(233);
let ShareModule = class ShareModule {
};
exports.ShareModule = ShareModule;
exports.ShareModule = ShareModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([share_entity_1.Share])],
        controllers: [share_controller_1.ShareController],
        providers: [share_service_1.ShareService],
    })
], ShareModule);


/***/ }),
/* 232 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ShareController = void 0;
const jwtAuth_guard_1 = __webpack_require__(87);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const share_service_1 = __webpack_require__(233);
let ShareController = class ShareController {
    shareService;
    constructor(shareService) {
        this.shareService = shareService;
    }
    async createShare(htmlContent) {
        if (!htmlContent) {
            throw new common_1.HttpException('HTML content is required', common_1.HttpStatus.BAD_REQUEST);
        }
        const shareCode = await this.shareService.createShare(htmlContent);
        return { shareCode };
    }
    async getShare(shareCode) {
        const share = await this.shareService.getShareByCode(shareCode);
        if (!share) {
            throw new common_1.HttpException('Share not found', common_1.HttpStatus.NOT_FOUND);
        }
        return { htmlContent: share.htmlContent };
    }
};
exports.ShareController = ShareController;
__decorate([
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('create'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '创建分享' }),
    __param(0, (0, common_1.Body)('htmlContent')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ShareController.prototype, "createShare", null);
__decorate([
    (0, common_1.Get)(':shareCode'),
    (0, swagger_1.ApiOperation)({ summary: '获取分享内容' }),
    __param(0, (0, common_1.Param)('shareCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ShareController.prototype, "getShare", null);
exports.ShareController = ShareController = __decorate([
    (0, swagger_1.ApiTags)('share'),
    (0, common_1.Controller)('share'),
    __metadata("design:paramtypes", [typeof (_a = typeof share_service_1.ShareService !== "undefined" && share_service_1.ShareService) === "function" ? _a : Object])
], ShareController);


/***/ }),
/* 233 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ShareService = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const globalConfig_service_1 = __webpack_require__(74);
const share_entity_1 = __webpack_require__(202);
let ShareService = class ShareService {
    shareRepository;
    globalConfigService;
    constructor(shareRepository, globalConfigService) {
        this.shareRepository = shareRepository;
        this.globalConfigService = globalConfigService;
    }
    generateShareCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    async createShare(htmlContent) {
        let shareCode;
        let isUnique = false;
        while (!isUnique) {
            shareCode = this.generateShareCode();
            const existing = await this.shareRepository.findOne({
                where: { shareCode },
            });
            if (!existing) {
                isUnique = true;
            }
        }
        const share = new share_entity_1.Share();
        share.shareCode = shareCode;
        share.htmlContent = htmlContent;
        try {
            await this.shareRepository.save(share);
            const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
            console.log(siteUrl);
            return `${siteUrl}/?shareCode=${shareCode}`;
        }
        catch (error) {
            console.error('保存分享内容失败:', error);
            throw new Error(`创建分享失败: ${error.message || '未知错误'}`);
        }
    }
    async getShareByCode(shareCode) {
        const share = await this.shareRepository.findOne({ where: { shareCode } });
        return await this.shareRepository.findOne({ where: { shareCode } });
    }
};
exports.ShareService = ShareService;
exports.ShareService = ShareService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(share_entity_1.Share)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _b : Object])
], ShareService);


/***/ }),
/* 234 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SigninModule = void 0;
const common_1 = __webpack_require__(2);
const signin_controller_1 = __webpack_require__(235);
const signin_service_1 = __webpack_require__(236);
const typeorm_1 = __webpack_require__(33);
const signIn_entity_1 = __webpack_require__(203);
const user_entity_1 = __webpack_require__(83);
let SigninModule = class SigninModule {
};
exports.SigninModule = SigninModule;
exports.SigninModule = SigninModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([signIn_entity_1.SigninEntity, user_entity_1.UserEntity])],
        controllers: [signin_controller_1.SigninController],
        providers: [signin_service_1.SigninService],
        exports: [signin_service_1.SigninService],
    })
], SigninModule);


/***/ }),
/* 235 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SigninController = void 0;
const common_1 = __webpack_require__(2);
const signin_service_1 = __webpack_require__(236);
const swagger_1 = __webpack_require__(14);
const jwtAuth_guard_1 = __webpack_require__(87);
const express_1 = __webpack_require__(104);
let SigninController = class SigninController {
    signinService;
    constructor(signinService) {
        this.signinService = signinService;
    }
    async sign(req) {
        return await this.signinService.sign(req);
    }
    async getSigninLog(req) {
        return await this.signinService.getSigninLog(req);
    }
};
exports.SigninController = SigninController;
__decorate([
    (0, common_1.Post)('sign'),
    (0, swagger_1.ApiOperation)({ summary: '用户签到' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], SigninController.prototype, "sign", null);
__decorate([
    (0, common_1.Get)('signinLog'),
    (0, swagger_1.ApiOperation)({ summary: '获取用户签到信息' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], SigninController.prototype, "getSigninLog", null);
exports.SigninController = SigninController = __decorate([
    (0, swagger_1.ApiTags)('signIn'),
    (0, common_1.Controller)('signin'),
    __metadata("design:paramtypes", [typeof (_a = typeof signin_service_1.SigninService !== "undefined" && signin_service_1.SigninService) === "function" ? _a : Object])
], SigninController);


/***/ }),
/* 236 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SigninService = void 0;
const globalConfig_service_1 = __webpack_require__(74);
const userBalance_service_1 = __webpack_require__(34);
const common_1 = __webpack_require__(2);
const signIn_entity_1 = __webpack_require__(203);
const typeorm_1 = __webpack_require__(33);
const typeorm_2 = __webpack_require__(3);
const date_1 = __webpack_require__(47);
const user_entity_1 = __webpack_require__(83);
const balance_constant_1 = __webpack_require__(35);
let SigninService = class SigninService {
    signinEntity;
    userEntity;
    userBalanceService;
    globalConfigService;
    constructor(signinEntity, userEntity, userBalanceService, globalConfigService) {
        this.signinEntity = signinEntity;
        this.userEntity = userEntity;
        this.userBalanceService = userBalanceService;
        this.globalConfigService = globalConfigService;
    }
    async sign(req) {
        const { id: userId } = req.user;
        const formattedDate = (0, date_1.default)(new Date()).format('YYYY-MM-DD');
        const existingSignin = await this.signinEntity.findOne({
            where: { userId, signInDate: formattedDate },
        });
        if (existingSignin) {
            throw new common_1.HttpException('今日已签到、改天再来吧!.', common_1.HttpStatus.BAD_REQUEST);
        }
        const { model3Count, model4Count, drawMjCount } = await this.globalConfigService.getSignatureGiftConfig();
        await this.signinEntity.save({
            userId: userId,
            signInTime: new Date(),
            signInDate: formattedDate,
            isSigned: true,
        });
        await this.userBalanceService.addBalanceToUser(userId, {
            model3Count,
            model4Count,
            drawMjCount,
        });
        await this.userBalanceService.saveRecordRechargeLog({
            userId,
            rechargeType: balance_constant_1.RechargeType.SIGN_IN,
            model3Count,
            model4Count,
            drawMjCount,
        });
        const yesterday = (0, date_1.default)(new Date()).subtract(1, 'day').format('YYYY-MM-DD');
        const previousSignin = await this.signinEntity.findOne({
            where: { userId: userId, signInDate: yesterday },
        });
        if (previousSignin) {
            common_1.Logger.debug(`用户${userId}昨天签到了、今天是连续签到！`, 'SigninService');
            const userInfo = await this.userEntity.findOne({ where: { id: userId } });
            if (!userInfo) {
                throw new common_1.HttpException('用户不存在', common_1.HttpStatus.BAD_REQUEST);
            }
            const { consecutiveDays = 0 } = userInfo;
            await this.userEntity.update({ id: userId }, { consecutiveDays: consecutiveDays + 1 });
        }
        else {
            common_1.Logger.debug(`用户${userId}昨天没签到、今天重置天数！`, 'SigninService');
            await this.userEntity.update({ id: userId }, { consecutiveDays: 1 });
        }
        return 'Sign in successful.';
    }
    async getSigninLog(req) {
        try {
            const { id: userId } = req.user;
            const firstDay = (0, date_1.default)().startOf('month').format('YYYY-MM-DD HH:mm:ss');
            const lastDay = (0, date_1.default)().endOf('month').format('YYYY-MM-DD HH:mm:ss');
            const queryBuilder = this.signinEntity.createQueryBuilder('signin');
            const signInData = await queryBuilder
                .select('signin.signInDate as signInDate, signin.isSigned as isSigned')
                .andWhere('signin.userId = :userId', { userId: req.user.id })
                .andWhere('signin.signInTime >= :firstDay', { firstDay })
                .andWhere('signin.signInTime <= :lastDay', { lastDay })
                .getRawMany();
            const startDate = new Date(firstDay);
            const endDate = new Date(lastDay);
            const dateRange = [];
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                dateRange.push((0, date_1.default)(new Date(currentDate)).format('YYYY-MM-DD'));
                currentDate.setDate(currentDate.getDate() + 1);
            }
            const res = [];
            for (const date of dateRange) {
                const existingData = signInData.find(item => item.signInDate === date);
                if (!existingData) {
                    res.push({ signInDate: date, isSigned: false });
                }
                else {
                    existingData.isSigned = true;
                    res.push(existingData);
                }
            }
            return res;
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('获取签到数据失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
exports.SigninService = SigninService;
exports.SigninService = SigninService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(signIn_entity_1.SigninEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof userBalance_service_1.UserBalanceService !== "undefined" && userBalance_service_1.UserBalanceService) === "function" ? _c : Object, typeof (_d = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _d : Object])
], SigninService);


/***/ }),
/* 237 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SpaModule = void 0;
const common_1 = __webpack_require__(2);
const spa_controller_1 = __webpack_require__(238);
let SpaModule = class SpaModule {
};
exports.SpaModule = SpaModule;
exports.SpaModule = SpaModule = __decorate([
    (0, common_1.Module)({
        controllers: [spa_controller_1.SpaController],
    })
], SpaModule);


/***/ }),
/* 238 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var SpaController_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SpaController = void 0;
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const fs = __webpack_require__(18);
const path_1 = __webpack_require__(20);
let SpaController = SpaController_1 = class SpaController {
    logger = new common_1.Logger(SpaController_1.name);
    indexPath = (0, path_1.join)(process.cwd(), 'public/chat/index.html');
    publicPath = (0, path_1.join)(process.cwd(), 'public/chat');
    exists;
    adminPath;
    constructor() {
        this.exists = fs.existsSync(this.indexPath);
        this.adminPath = process.env.ADMIN_SERVE_ROOT || '/admin';
        common_1.Logger.log(`管理后台路径已配置: ${this.adminPath}`, 'SpaController');
    }
    serveClient(req, res, next) {
        this.logger.debug(`收到请求: ${req.path}`);
        if (req.path.startsWith('/api') ||
            req.path.startsWith('/file') ||
            req.path.startsWith(this.adminPath)) {
            return next();
        }
        const filePath = (0, path_1.join)(this.publicPath, req.path);
        if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
            return next();
        }
        if (!this.exists) {
            return res.status(500).send({ code: 500, message: 'SPA入口文件不存在', data: null });
        }
        return res.sendFile(this.indexPath);
    }
};
exports.SpaController = SpaController;
__decorate([
    (0, common_1.Get)('*'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Next)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object, typeof (_b = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _b : Object, Object]),
    __metadata("design:returntype", void 0)
], SpaController.prototype, "serveClient", null);
exports.SpaController = SpaController = SpaController_1 = __decorate([
    (0, swagger_1.ApiTags)('spa'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [])
], SpaController);


/***/ }),
/* 239 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatisticModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const chatLog_entity_1 = __webpack_require__(75);
const config_entity_1 = __webpack_require__(73);
const order_entity_1 = __webpack_require__(201);
const user_entity_1 = __webpack_require__(83);
const statistic_controller_1 = __webpack_require__(240);
const statistic_service_1 = __webpack_require__(242);
let StatisticModule = class StatisticModule {
};
exports.StatisticModule = StatisticModule;
exports.StatisticModule = StatisticModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([user_entity_1.UserEntity, chatLog_entity_1.ChatLogEntity, config_entity_1.ConfigEntity, order_entity_1.OrderEntity])],
        controllers: [statistic_controller_1.StatisticController],
        providers: [statistic_service_1.StatisticService],
    })
], StatisticModule);


/***/ }),
/* 240 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatisticController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const queryStatisticDto_dto_1 = __webpack_require__(241);
const statistic_service_1 = __webpack_require__(242);
let StatisticController = class StatisticController {
    statisticService;
    constructor(statisticService) {
        this.statisticService = statisticService;
    }
    getBaseStatistic() {
        return this.statisticService.getBaseStatistic();
    }
    getChatStatistic(params) {
        return this.statisticService.getChatStatistic(params);
    }
    getBaiduStatistics(params) {
        return this.statisticService.getBaiduVisit(params);
    }
};
exports.StatisticController = StatisticController;
__decorate([
    (0, common_1.Get)('base'),
    (0, swagger_1.ApiOperation)({ summary: '获取基础统计数据' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StatisticController.prototype, "getBaseStatistic", null);
__decorate([
    (0, common_1.Get)('chatStatistic'),
    (0, swagger_1.ApiOperation)({ summary: '获取聊天绘画统计数据' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof queryStatisticDto_dto_1.QueryStatisticDto !== "undefined" && queryStatisticDto_dto_1.QueryStatisticDto) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], StatisticController.prototype, "getChatStatistic", null);
__decorate([
    (0, common_1.Get)('baiduVisit'),
    (0, swagger_1.ApiOperation)({ summary: '获取百度统计数据' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof queryStatisticDto_dto_1.QueryStatisticDto !== "undefined" && queryStatisticDto_dto_1.QueryStatisticDto) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], StatisticController.prototype, "getBaiduStatistics", null);
exports.StatisticController = StatisticController = __decorate([
    (0, swagger_1.ApiTags)('statistic'),
    (0, common_1.Controller)('statistic'),
    __metadata("design:paramtypes", [typeof (_a = typeof statistic_service_1.StatisticService !== "undefined" && statistic_service_1.StatisticService) === "function" ? _a : Object])
], StatisticController);


/***/ }),
/* 241 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QueryStatisticDto = void 0;
const swagger_1 = __webpack_require__(14);
class QueryStatisticDto {
    days;
}
exports.QueryStatisticDto = QueryStatisticDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 7, description: '查询最近N天的数据', required: true }),
    __metadata("design:type", Number)
], QueryStatisticDto.prototype, "days", void 0);


/***/ }),
/* 242 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatisticService = void 0;
const balance_constant_1 = __webpack_require__(35);
const date_1 = __webpack_require__(47);
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const axios_1 = __webpack_require__(39);
const typeorm_2 = __webpack_require__(3);
const chatLog_entity_1 = __webpack_require__(75);
const config_entity_1 = __webpack_require__(73);
const globalConfig_service_1 = __webpack_require__(74);
const order_entity_1 = __webpack_require__(201);
const user_entity_1 = __webpack_require__(83);
let StatisticService = class StatisticService {
    userEntity;
    chatLogEntity;
    configEntity;
    orderEntity;
    globalConfigService;
    constructor(userEntity, chatLogEntity, configEntity, orderEntity, globalConfigService) {
        this.userEntity = userEntity;
        this.chatLogEntity = chatLogEntity;
        this.configEntity = configEntity;
        this.orderEntity = orderEntity;
        this.globalConfigService = globalConfigService;
    }
    async getBaseStatistic() {
        const userCount = await this.countUsers();
        const newUserCount = await this.countNewUsersToday();
        const chatCount = await this.countChats();
        const newChatCount = await this.countNewChatsToday();
        const drawCount = await this.countDraws();
        const dellDrawCount = await this.countNewDrawsToday();
        const orderCount = await this.countOrders();
        const newOrderCount = await this.countNewOrdersToday();
        return {
            userCount,
            newUserCount,
            chatCount,
            newChatCount,
            drawCount,
            newDrawCount: dellDrawCount,
            orderCount,
            newOrderCount,
        };
    }
    async getChatStatistic({ days = 7 }) {
        const chatData = await this.countChatsByTimeRange(days);
        const drawData = await this.countDrawsByTimeRange(days);
        return {
            date: chatData.map(item => item.date),
            chat: chatData.map((item) => item.value),
            draw: drawData.map((item, index) => {
                return item.value;
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
        const userCount = await queryBuilder
            .where('user.createdAt >= :today', { today })
            .andWhere('user.createdAt < :tomorrow', { tomorrow })
            .getCount();
        return userCount;
    }
    async countChats() {
        const chatCount = await this.chatLogEntity.count({
            where: { type: balance_constant_1.ChatType.NORMAL_CHAT },
        });
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
        const drawCount = await this.chatLogEntity.count({
            where: { type: balance_constant_1.ChatType.PAINT },
        });
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
    async countChatsByTimeRange(days) {
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
            const count = result.find((r) => (0, date_1.formatDate)(new Date(r.date), 'M.DD') === dateString)?.count ?? 0;
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
            const count = result.find((r) => (0, date_1.formatDate)(new Date(r.date), 'M.DD') === dateString)?.count ?? 0;
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
    async getNewAccessToken(baiduApiKey, baiduSecretKey, baiduRefreshToken) {
        const tokenUrl = `http://openapi.baidu.com/oauth/2.0/token?grant_type=refresh_token&refresh_token=${baiduRefreshToken}&client_id=${baiduApiKey}&client_secret=${baiduSecretKey}`;
        common_1.Logger.log('获取新 accessToken', tokenUrl);
        try {
            const tokenRes = await axios_1.default.get(tokenUrl);
            if (tokenRes.status === 200 && tokenRes.data.access_token) {
                return {
                    accessToken: tokenRes.data.access_token,
                    refreshToken: tokenRes.data.refresh_token,
                };
            }
            else {
                throw new Error('Failed to get new access token');
            }
        }
        catch (tokenError) {
            common_1.Logger.error('获取新 accessToken 失败', {
                message: tokenError.message,
                stack: tokenError.stack,
                response: tokenError.response ? tokenError.response.data : 'No response data',
            });
            throw new common_1.HttpException('获取新 accessToken 失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async updateAccessTokenInDatabase(accessToken, refreshToken, configEntity) {
        await configEntity.update({ configKey: 'baiduToken' }, { configVal: accessToken });
        await configEntity.update({ configKey: 'baiduRefreshToken' }, { configVal: refreshToken });
    }
    async getBaiduStatistics(days) {
        const end_date = (0, date_1.formatDate)(new Date(), 'YYYYMMDD');
        const start_date = (0, date_1.formatDate)(new Date(Date.now() - Number(days - 1) * 24 * 60 * 60 * 1000), 'YYYYMMDD');
        const metrics = 'pv_count,visitor_count,ip_count,bounce_ratio,avg_visit_time';
        const method = 'overview/getTimeTrendRpt';
        const { baiduToken, baiduSiteId, baiduApiKey, baiduSecretKey, baiduRefreshToken } = await this.globalConfigService.getConfigs([
            'baiduToken',
            'baiduSiteId',
            'baiduApiKey',
            'baiduSecretKey',
            'baiduRefreshToken',
        ]);
        if (!baiduApiKey || !baiduSiteId || !baiduRefreshToken || !baiduSecretKey) {
            return [];
        }
        let accessToken = baiduToken;
        let res;
        let url;
        const fetchData = async (token) => {
            url = `https://openapi.baidu.com/rest/2.0/tongji/report/getData?access_token=${token}&site_id=${baiduSiteId}&method=${method}&start_date=${start_date}&end_date=${end_date}&metrics=${metrics}`;
            try {
                return await axios_1.default.get(url);
            }
            catch (error) {
                return {
                    data: {
                        error_code: 111,
                        message: 'Access token invalid or no longer valid',
                    },
                };
            }
        };
        res = await fetchData(accessToken);
        if (res.data.error_code === 111 || !baiduToken) {
            const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await this.getNewAccessToken(baiduApiKey, baiduSecretKey, baiduRefreshToken);
            accessToken = newAccessToken;
            await this.updateAccessTokenInDatabase(accessToken, newRefreshToken, this.configEntity);
            res = await fetchData(accessToken);
        }
        const { error_code, message } = res.data;
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
exports.StatisticService = StatisticService;
exports.StatisticService = StatisticService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(chatLog_entity_1.ChatLogEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(config_entity_1.ConfigEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(order_entity_1.OrderEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _b : Object, typeof (_c = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _c : Object, typeof (_d = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _d : Object, typeof (_e = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _e : Object])
], StatisticService);


/***/ }),
/* 243 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TaskModule = void 0;
const common_1 = __webpack_require__(2);
const schedule_1 = __webpack_require__(244);
const typeorm_1 = __webpack_require__(33);
const globalConfig_module_1 = __webpack_require__(204);
const models_module_1 = __webpack_require__(208);
const userBalance_entity_1 = __webpack_require__(81);
const task_service_1 = __webpack_require__(245);
let TaskModule = class TaskModule {
};
exports.TaskModule = TaskModule;
exports.TaskModule = TaskModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            typeorm_1.TypeOrmModule.forFeature([userBalance_entity_1.UserBalanceEntity]),
            globalConfig_module_1.GlobalConfigModule,
            models_module_1.ModelsModule,
        ],
        providers: [task_service_1.TaskService],
    })
], TaskModule);


/***/ }),
/* 244 */
/***/ ((module) => {

module.exports = require("@nestjs/schedule");

/***/ }),
/* 245 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TaskService = void 0;
const common_1 = __webpack_require__(2);
const schedule_1 = __webpack_require__(244);
const typeorm_1 = __webpack_require__(33);
const fs = __webpack_require__(18);
const path = __webpack_require__(20);
const typeorm_2 = __webpack_require__(3);
const models_service_1 = __webpack_require__(76);
const userBalance_entity_1 = __webpack_require__(81);
const globalConfig_service_1 = __webpack_require__(74);
let TaskService = class TaskService {
    userBalanceEntity;
    globalConfigService;
    modelsService;
    constructor(userBalanceEntity, globalConfigService, modelsService) {
        this.userBalanceEntity = userBalanceEntity;
        this.globalConfigService = globalConfigService;
        this.modelsService = modelsService;
    }
    handleCron() {
        common_1.Logger.debug('Automatically refresh WeChat access every hour Token', 'TaskService');
        this.globalConfigService.getWechatAccessToken();
    }
    async checkUserMemerExpire() {
        const expireUsers = await this.userBalanceEntity.find({
            where: { expirationTime: (0, typeorm_2.LessThanOrEqual)(new Date()) },
        });
        if (!expireUsers || !expireUsers.length)
            return;
        expireUsers.forEach((user) => {
            this.userBalanceEntity
                .update({ id: user.id }, {
                expirationTime: null,
                packageId: 0,
                memberModel3Count: 0,
                memberModel4Count: 0,
                memberDrawMjCount: 0,
                appCats: '',
            })
                .then(res => {
                common_1.Logger.debug(`${user.id}会员已到期、清空所有余额并移除会员身份！`, 'TaskService');
            });
        });
    }
    findFilePath(filename) {
        const possiblePaths = [
            path.join(process.cwd(), filename),
            path.join(__dirname, '..', '..', '..', filename),
            path.join(__dirname, filename),
            path.resolve(filename),
            path.join(process.cwd(), '..', filename),
            path.join(process.cwd(), 'dist', filename),
        ];
        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }
        return null;
    }
};
exports.TaskService = TaskService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TaskService.prototype, "handleCron", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TaskService.prototype, "checkUserMemerExpire", null);
exports.TaskService = TaskService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(userBalance_entity_1.UserBalanceEntity)),
    __metadata("design:paramtypes", [typeof (_a = typeof typeorm_2.Repository !== "undefined" && typeorm_2.Repository) === "function" ? _a : Object, typeof (_b = typeof globalConfig_service_1.GlobalConfigService !== "undefined" && globalConfig_service_1.GlobalConfigService) === "function" ? _b : Object, typeof (_c = typeof models_service_1.ModelsService !== "undefined" && models_service_1.ModelsService) === "function" ? _c : Object])
], TaskService);


/***/ }),
/* 246 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UploadModule = void 0;
const common_1 = __webpack_require__(2);
const redisCache_module_1 = __webpack_require__(26);
const upload_controller_1 = __webpack_require__(247);
const upload_service_1 = __webpack_require__(160);
let UploadModule = class UploadModule {
};
exports.UploadModule = UploadModule;
exports.UploadModule = UploadModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [redisCache_module_1.RedisCacheModule],
        providers: [upload_service_1.UploadService],
        controllers: [upload_controller_1.UploadController],
        exports: [upload_service_1.UploadService],
    })
], UploadModule);


/***/ }),
/* 247 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UploadController = void 0;
const jwtAuth_guard_1 = __webpack_require__(87);
const common_1 = __webpack_require__(2);
const platform_express_1 = __webpack_require__(248);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const upload_service_1 = __webpack_require__(160);
let UploadController = class UploadController {
    uploadService;
    constructor(uploadService) {
        this.uploadService = uploadService;
    }
    async uploadFile(file, req, dir) {
        return this.uploadService.uploadFile(file, dir, req.user);
    }
};
exports.UploadController = UploadController;
__decorate([
    (0, common_1.Post)('file'),
    (0, swagger_1.ApiOperation)({ summary: '上传文件' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: {
            fileSize: 10 * 1024 * 1024,
        },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Query)('dir')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object, String]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "uploadFile", null);
exports.UploadController = UploadController = __decorate([
    (0, swagger_1.ApiTags)('upload'),
    (0, common_1.Controller)('upload'),
    __metadata("design:paramtypes", [typeof (_a = typeof upload_service_1.UploadService !== "undefined" && upload_service_1.UploadService) === "function" ? _a : Object])
], UploadController);


/***/ }),
/* 248 */
/***/ ((module) => {

module.exports = require("@nestjs/platform-express");

/***/ }),
/* 249 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserBalanceModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const app_entity_1 = __webpack_require__(106);
const app_service_1 = __webpack_require__(105);
const appCats_entity_1 = __webpack_require__(107);
const userApps_entity_1 = __webpack_require__(108);
const chatGroup_entity_1 = __webpack_require__(82);
const chatLog_entity_1 = __webpack_require__(75);
const cramiPackage_entity_1 = __webpack_require__(71);
const config_entity_1 = __webpack_require__(73);
const globalConfig_module_1 = __webpack_require__(204);
const redisCache_service_1 = __webpack_require__(28);
const user_entity_1 = __webpack_require__(83);
const verification_entity_1 = __webpack_require__(101);
const verification_service_1 = __webpack_require__(100);
const accountLog_entity_1 = __webpack_require__(79);
const balance_entity_1 = __webpack_require__(80);
const fingerprint_entity_1 = __webpack_require__(84);
const userBalance_controller_1 = __webpack_require__(250);
const userBalance_entity_1 = __webpack_require__(81);
const userBalance_service_1 = __webpack_require__(34);
let UserBalanceModule = class UserBalanceModule {
};
exports.UserBalanceModule = UserBalanceModule;
exports.UserBalanceModule = UserBalanceModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                appCats_entity_1.AppCatsEntity,
                app_entity_1.AppEntity,
                userApps_entity_1.UserAppsEntity,
                accountLog_entity_1.AccountLogEntity,
                balance_entity_1.BalanceEntity,
                userBalance_entity_1.UserBalanceEntity,
                cramiPackage_entity_1.CramiPackageEntity,
                config_entity_1.ConfigEntity,
                chatGroup_entity_1.ChatGroupEntity,
                chatLog_entity_1.ChatLogEntity,
                user_entity_1.UserEntity,
                verification_entity_1.VerificationEntity,
                fingerprint_entity_1.FingerprintLogEntity,
            ]),
            globalConfig_module_1.GlobalConfigModule,
        ],
        controllers: [userBalance_controller_1.UserBalanceController],
        providers: [userBalance_service_1.UserBalanceService, verification_service_1.VerificationService, redisCache_service_1.RedisCacheService, app_service_1.AppService],
        exports: [userBalance_service_1.UserBalanceService, app_service_1.AppService, typeorm_1.TypeOrmModule],
    })
], UserBalanceModule);


/***/ }),
/* 250 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserBalanceController = void 0;
const adminAuth_guard_1 = __webpack_require__(86);
const jwtAuth_guard_1 = __webpack_require__(87);
const common_1 = __webpack_require__(2);
const swagger_1 = __webpack_require__(14);
const express_1 = __webpack_require__(104);
const userBalance_service_1 = __webpack_require__(34);
let UserBalanceController = class UserBalanceController {
    userBalanceService;
    constructor(userBalanceService) {
        this.userBalanceService = userBalanceService;
    }
    async getRechargeLog(req, params) {
        return this.userBalanceService.getRechargeLog(req, params);
    }
    async getAccountLog(req, params) {
        return this.userBalanceService.getAccountLog(req, params);
    }
    async getBalance(req) {
        return this.userBalanceService.queryUserBalance(req.user.id);
    }
    async inheritVisitorData(req) {
        return this.userBalanceService.inheritVisitorData(req);
    }
    async getVisitorCount(req) {
        return this.userBalanceService.getVisitorCount(req);
    }
};
exports.UserBalanceController = UserBalanceController;
__decorate([
    (0, common_1.Get)('rechargeLog'),
    (0, swagger_1.ApiOperation)({ summary: '获取个人充值记录' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object, Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "getRechargeLog", null);
__decorate([
    (0, common_1.Get)('accountLog'),
    (0, swagger_1.ApiOperation)({ summary: '获取所有人账户记录' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object, Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "getAccountLog", null);
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '获取个人余额信息' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "getBalance", null);
__decorate([
    (0, common_1.Post)('inheritVisitorData'),
    (0, swagger_1.ApiOperation)({ summary: '继承当前设备数据' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "inheritVisitorData", null);
__decorate([
    (0, common_1.Get)('getVisitorCount'),
    (0, swagger_1.ApiOperation)({ summary: '获取本机指纹数据' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], UserBalanceController.prototype, "getVisitorCount", null);
exports.UserBalanceController = UserBalanceController = __decorate([
    (0, swagger_1.ApiTags)('balance'),
    (0, common_1.Controller)('balance'),
    __metadata("design:paramtypes", [typeof (_a = typeof userBalance_service_1.UserBalanceService !== "undefined" && userBalance_service_1.UserBalanceService) === "function" ? _a : Object])
], UserBalanceController);


/***/ }),
/* 251 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VerificationModule = void 0;
const common_1 = __webpack_require__(2);
const typeorm_1 = __webpack_require__(33);
const redisCache_service_1 = __webpack_require__(28);
const verification_entity_1 = __webpack_require__(101);
const verification_service_1 = __webpack_require__(100);
let VerificationModule = class VerificationModule {
};
exports.VerificationModule = VerificationModule;
exports.VerificationModule = VerificationModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([verification_entity_1.VerificationEntity])],
        providers: [redisCache_service_1.RedisCacheService, verification_service_1.VerificationService],
    })
], VerificationModule);


/***/ }),
/* 252 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AllExceptionsFilter = void 0;
const common_1 = __webpack_require__(2);
let AllExceptionsFilter = class AllExceptionsFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const _request = ctx.getRequest();
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (status === common_1.HttpStatus.BAD_REQUEST && Array.isArray(exceptionResponse?.message)) {
                response.status(status).json({
                    code: status,
                    message: exceptionResponse.message[0],
                    data: null,
                });
                return;
            }
            response.status(status).json({
                code: status,
                message: exception.message,
                data: null,
            });
            return;
        }
        response.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
            code: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
            message: '服务器内部错误',
            data: null,
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);


/***/ }),
/* 253 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.initDatabase = initDatabase;
const common_1 = __webpack_require__(2);
const dotenv_1 = __webpack_require__(17);
const mysql = __webpack_require__(254);
const typeorm_1 = __webpack_require__(3);
const app_entity_1 = __webpack_require__(106);
const appCats_entity_1 = __webpack_require__(107);
const userApps_entity_1 = __webpack_require__(108);
const autoReply_entity_1 = __webpack_require__(136);
const badWords_entity_1 = __webpack_require__(144);
const violationLog_entity_1 = __webpack_require__(145);
const chatGroup_entity_1 = __webpack_require__(82);
const chatLog_entity_1 = __webpack_require__(75);
const crami_entity_1 = __webpack_require__(190);
const cramiPackage_entity_1 = __webpack_require__(71);
const config_entity_1 = __webpack_require__(73);
const models_entity_1 = __webpack_require__(78);
const order_entity_1 = __webpack_require__(201);
const plugin_entity_1 = __webpack_require__(159);
const share_entity_1 = __webpack_require__(202);
const signIn_entity_1 = __webpack_require__(203);
const user_entity_1 = __webpack_require__(83);
const accountLog_entity_1 = __webpack_require__(79);
const balance_entity_1 = __webpack_require__(80);
const fingerprint_entity_1 = __webpack_require__(84);
const userBalance_entity_1 = __webpack_require__(81);
const verification_entity_1 = __webpack_require__(101);
(0, dotenv_1.config)();
const dataSourceOptions = {
    type: 'mysql',
    port: parseInt(process.env.DB_PORT, 10),
    host: process.env.DB_HOST,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
    entities: [
        share_entity_1.Share,
        autoReply_entity_1.AutoReplyEntity,
        crami_entity_1.CramiEntity,
        cramiPackage_entity_1.CramiPackageEntity,
        badWords_entity_1.BadWordsEntity,
        chatGroup_entity_1.ChatGroupEntity,
        verification_entity_1.VerificationEntity,
        signIn_entity_1.SigninEntity,
        violationLog_entity_1.ViolationLogEntity,
        models_entity_1.ModelsEntity,
        user_entity_1.UserEntity,
        accountLog_entity_1.AccountLogEntity,
        fingerprint_entity_1.FingerprintLogEntity,
        balance_entity_1.BalanceEntity,
        userBalance_entity_1.UserBalanceEntity,
        plugin_entity_1.PluginEntity,
        config_entity_1.ConfigEntity,
        chatLog_entity_1.ChatLogEntity,
        userApps_entity_1.UserAppsEntity,
        appCats_entity_1.AppCatsEntity,
        app_entity_1.AppEntity,
        order_entity_1.OrderEntity,
    ],
    synchronize: false,
    charset: 'utf8mb4',
    timezone: '+08:00',
};
async function migrateColumnType(tableName, columnName, targetType, conn) {
    try {
        const [tables] = (await conn.execute(`SHOW TABLES LIKE '${tableName}'`));
        if (tables.length === 0) {
            common_1.Logger.log(`表 ${tableName} 不存在，跳过 ${columnName} 列的迁移`, 'Database');
            return false;
        }
        const [columns] = (await conn.execute(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [process.env.DB_DATABASE, tableName, columnName]));
        if (columns.length === 0) {
            common_1.Logger.log(`表 ${tableName} 中不存在 ${columnName} 列，跳过迁移`, 'Database');
            return false;
        }
        const currentType = columns[0].DATA_TYPE.toLowerCase();
        if (currentType === targetType.toLowerCase()) {
            common_1.Logger.log(`表 ${tableName} 中的 ${columnName} 列已经是 ${targetType} 类型`, 'Database');
            return false;
        }
        const [constraints] = (await conn.execute(`SELECT k.CONSTRAINT_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
       WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.COLUMN_NAME = ?`, [process.env.DB_DATABASE, tableName, columnName]));
        for (const constraint of constraints) {
            if (constraint.CONSTRAINT_NAME) {
                common_1.Logger.log(`发现 ${columnName} 列有约束: ${constraint.CONSTRAINT_NAME}，尝试删除`, 'Database');
                try {
                    await conn.execute(`ALTER TABLE ${tableName} DROP FOREIGN KEY ${constraint.CONSTRAINT_NAME}`);
                    common_1.Logger.log(`成功删除 ${columnName} 外键约束`, 'Database');
                }
                catch (constraintError) {
                    common_1.Logger.error(`删除外键约束失败: ${constraintError.message}`, 'Database');
                }
            }
        }
        const [indexes] = (await conn.execute(`SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [process.env.DB_DATABASE, tableName, columnName]));
        for (const idx of indexes) {
            if (idx.INDEX_NAME !== 'PRIMARY') {
                common_1.Logger.log(`发现 ${columnName} 是索引 ${idx.INDEX_NAME} 的一部分，尝试删除索引`, 'Database');
                try {
                    await conn.execute(`ALTER TABLE ${tableName} DROP INDEX ${idx.INDEX_NAME}`);
                    common_1.Logger.log(`成功删除索引 ${idx.INDEX_NAME}`, 'Database');
                }
                catch (indexError) {
                    common_1.Logger.error(`删除索引失败: ${indexError.message}`, 'Database');
                }
            }
        }
        common_1.Logger.log(`开始将 ${tableName} 表中的 ${columnName} 列类型从 ${currentType} 升级为 ${targetType}`, 'Database');
        await conn.execute(`ALTER TABLE ${tableName} MODIFY COLUMN \`${columnName}\` ${targetType}`);
        common_1.Logger.log(`${tableName} 表中的 ${columnName} 列类型已成功升级为 ${targetType}`, 'Database');
        return true;
    }
    catch (error) {
        common_1.Logger.error(`迁移 ${tableName}.${columnName} 列类型时出错:`, error, 'Database');
        return false;
    }
}
async function runAllMigrations() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        port: parseInt(process.env.DB_PORT, 10),
        database: process.env.DB_DATABASE,
    });
    try {
        try {
            await migrateColumnType('config', 'configVal', 'TEXT', conn);
        }
        catch (error) {
            common_1.Logger.log(`迁移config表configVal列时跳过: ${error.message}`, 'Database');
        }
        try {
            await migrateColumnType('app', 'coverImg', 'TEXT', conn);
        }
        catch (error) {
            common_1.Logger.log(`迁移app表coverImg列时跳过: ${error.message}`, 'Database');
        }
        try {
            const appCatIdMigrated = await migrateColumnType('app', 'catId', 'TEXT', conn);
            if (appCatIdMigrated) {
                const [apps] = (await conn.execute(`SELECT id, catId FROM app`));
                for (const app of apps) {
                    if (app.catId !== null && app.catId !== undefined) {
                        await conn.execute(`UPDATE app SET catId = ? WHERE id = ?`, [
                            app.catId.toString(),
                            app.id,
                        ]);
                    }
                }
            }
        }
        catch (error) {
            common_1.Logger.log(`迁移app表catId列时跳过: ${error.message}`, 'Database');
        }
        const chatlogColumns = ['content', 'fileVectorResult'];
        for (const column of chatlogColumns) {
            try {
                await migrateColumnType('chatlog', column, 'MEDIUMTEXT', conn);
            }
            catch (error) {
                common_1.Logger.log(`迁移chatlog表${column}列时跳过: ${error.message}`, 'Database');
            }
        }
    }
    finally {
        await conn.end();
    }
}
async function initDatabase() {
    try {
        common_1.Logger.log('开始数据库初始化流程', 'Database');
        common_1.Logger.log('执行数据库迁移操作', 'Database');
        await runAllMigrations();
        common_1.Logger.log('数据迁移操作完成，现在执行同步确保所有新表和字段存在', 'Database');
        const dataSource = new typeorm_1.DataSource(dataSourceOptions);
        await dataSource.initialize();
        common_1.Logger.log('已连接到数据库，准备同步结构', 'Database');
        if (dataSource.isInitialized) {
            await dataSource.destroy();
        }
        const syncOptions = {
            ...dataSourceOptions,
            synchronize: true,
        };
        const syncDataSource = new typeorm_1.DataSource(syncOptions);
        await syncDataSource.initialize();
        common_1.Logger.log('数据库结构同步完成', 'Database');
        if (syncDataSource.isInitialized) {
            await syncDataSource.destroy();
        }
        common_1.Logger.log('数据库初始化成功完成', 'Database');
    }
    catch (error) {
        common_1.Logger.error(`数据库初始化错误: ${error.message}`, 'Database');
        if (error instanceof SyntaxError) {
            common_1.Logger.error(`语法错误详情: ${JSON.stringify({
                name: error.name,
                message: error.message,
                stack: error.stack,
            })}`, 'Database');
        }
    }
}


/***/ }),
/* 254 */
/***/ ((module) => {

module.exports = require("mysql2/promise");

/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
const typeOrmQueryFailed_filter_1 = __webpack_require__(1);
const transform_interceptor_1 = __webpack_require__(4);
const custom_logger_service_1 = __webpack_require__(8);
const fast_xml_middleware_1 = __webpack_require__(10);
const common_1 = __webpack_require__(2);
const core_1 = __webpack_require__(13);
const swagger_1 = __webpack_require__(14);
const compression = __webpack_require__(15);
const crypto_1 = __webpack_require__(16);
const Dotenv = __webpack_require__(17);
const fs = __webpack_require__(18);
const ioredis_1 = __webpack_require__(19);
const path = __webpack_require__(20);
__webpack_require__(21);
const app_module_1 = __webpack_require__(22);
const allExceptions_filter_1 = __webpack_require__(252);
Dotenv.config({ path: '.env' });
function findFilePath(filename) {
    const possiblePaths = [
        path.join(process.cwd(), filename),
        path.join(__dirname, '..', filename),
        path.join(__dirname, filename),
        path.resolve(filename),
        path.join(process.cwd(), '..', filename),
        path.join(process.cwd(), 'dist', filename),
    ];
    for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }
    return null;
}
async function bootstrap() {
    console.log('\n======================================');
    console.log('        99AI 服务启动中...            ');
    console.log('======================================\n');
    const redis = new ioredis_1.default({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        db: Number(process.env.REDIS_DB || 0),
    });
    const existingSecret = await redis.get('JWT_SECRET');
    if (!existingSecret) {
        const jwtSecret = (0, crypto_1.randomBytes)(256).toString('base64');
        common_1.Logger.log('Generating and setting new JWT_SECRET');
        await redis.set('JWT_SECRET', jwtSecret);
    }
    const { initDatabase } = __webpack_require__(253);
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bufferLogs: true,
        logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    try {
        common_1.Logger.log('正在预初始化数据库结构...', 'Bootstrap');
        await initDatabase();
        common_1.Logger.log('数据库结构预初始化完成', 'Bootstrap');
    }
    catch (dbError) {
        common_1.Logger.error(`数据库预初始化失败: ${dbError.message}`, 'Bootstrap');
    }
    app.useLogger(app.get(custom_logger_service_1.CustomLoggerService));
    const xmlMiddleware = new fast_xml_middleware_1.FastXmlMiddleware();
    app.use(xmlMiddleware.use.bind(xmlMiddleware));
    app.use(compression({
        filter: (req, res) => {
            if (req.path.includes('/api/chatgpt/chat-process')) {
                return false;
            }
            return compression.filter(req, res);
        },
    }));
    app.enableCors({
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204,
    });
    app.setGlobalPrefix('/api', {
        exclude: [{ path: '*', method: common_1.RequestMethod.GET }],
    });
    app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor());
    app.useGlobalFilters(new typeOrmQueryFailed_filter_1.TypeOrmQueryFailedFilter());
    app.useGlobalFilters(new allExceptions_filter_1.AllExceptionsFilter());
    app.useGlobalPipes(new common_1.ValidationPipe());
    app.getHttpAdapter().getInstance().set('views', 'templates/pages');
    app.getHttpAdapter().getInstance().set('view engine', 'hbs');
    if (process.env.ISDEV === 'true') {
        const config = new swagger_1.DocumentBuilder()
            .setTitle('99AI API')
            .setDescription('99AI服务API文档')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        const responseSchema = {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                data: { type: 'object' },
                success: { type: 'boolean', example: true },
                message: { type: 'string', example: '请求成功' },
            },
        };
        Object.values(document.paths).forEach(path => {
            Object.values(path).forEach(method => {
                method.responses = {
                    ...method.responses,
                    '200': {
                        description: '成功响应',
                        content: {
                            'application/json': {
                                schema: responseSchema,
                            },
                        },
                    },
                };
            });
        });
        swagger_1.SwaggerModule.setup('api-docs', app, document);
        common_1.Logger.log('Swagger API文档已启用: http://localhost:' + (process.env.PORT || 3000) + '/api-docs', 'Main');
    }
    const PORT = process.env.PORT || 3000;
    const server = await app.listen(PORT, () => {
        console.log('\n======================================');
        console.log(`  服务启动成功: http://localhost:${PORT}`);
        console.log('======================================\n');
    });
    server.timeout = 5 * 60 * 1000;
}
bootstrap();

})();

/******/ })()
;