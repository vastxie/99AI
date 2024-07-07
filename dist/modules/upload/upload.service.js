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
exports.UploadService = void 0;
const utils_1 = require("../../common/utils");
const common_1 = require("@nestjs/common");
const ALIOSS = require("ali-oss");
const axios_1 = require("axios");
const TENCENTCOS = require("cos-nodejs-sdk-v5");
const FormData = require("form-data");
const fs = require("fs");
const path_1 = require("path");
const streamToBuffer = require("stream-to-buffer");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let UploadService = class UploadService {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    onModuleInit() { }
    async uploadFile(file, dir = 'others') {
        const { filename: name, originalname, buffer, mimetype, } = file;
        if (process.env.ISDEV) {
            dir = `dev/${dir}`;
        }
        common_1.Logger.debug(`准备上传文件: ${dir}`, 'UploadService');
        const now = new Date();
        const timestamp = now.getTime();
        const randomString = Math.random().toString(36).substring(2, 6);
        const fileType = mimetype ? mimetype.split('/')[1] : '';
        const filename = `${timestamp}_${randomString}.${fileType}`;
        common_1.Logger.debug(`准备上传文件: ${filename}, 类型: ${fileType}`, 'UploadService');
        const { tencentCosStatus = 0, aliOssStatus = 0, cheveretoStatus = 0, } = await this.globalConfigService.getConfigs([
            'tencentCosStatus',
            'aliOssStatus',
            'cheveretoStatus',
        ]);
        common_1.Logger.debug(`上传配置状态 - 腾讯云: ${tencentCosStatus}, 阿里云: ${aliOssStatus}, Chevereto: ${cheveretoStatus}`, 'UploadService');
        if (!Number(tencentCosStatus) &&
            !Number(aliOssStatus) &&
            !Number(cheveretoStatus)) {
            throw new common_1.HttpException('请先前往后台配置上传图片的方式', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            if (Number(tencentCosStatus)) {
                common_1.Logger.debug(`使用腾讯云COS上传`, 'UploadService');
                return await this.uploadFileByTencentCos({
                    filename,
                    buffer,
                    dir,
                    fileType,
                });
            }
            if (Number(aliOssStatus)) {
                common_1.Logger.debug(`使用阿里云OSS上传`, 'UploadService');
                return await this.uploadFileByAliOss({
                    filename,
                    buffer,
                    dir,
                    fileType,
                });
            }
            if (Number(cheveretoStatus)) {
                common_1.Logger.debug(`使用Chevereto上传`, 'UploadService');
                const { filename, buffer: fromBuffer, dir } = file;
                return await this.uploadFileByChevereto({
                    filename,
                    buffer: fromBuffer.toString('base64'),
                    dir,
                    fileType,
                });
            }
        }
        catch (error) {
            common_1.Logger.error(`上传失败: ${error.message}`, 'UploadService');
            throw error;
        }
    }
    async getUploadType() {
        const { tencentCosStatus = 0, aliOssStatus = 0, cheveretoStatus = 0, } = await this.globalConfigService.getConfigs([
            'tencentCosStatus',
            'aliOssStatus',
            'cheveretoStatus',
        ]);
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
        if (process.env.ISDEV) {
            dir = `dev/${dir}`;
        }
        const now = new Date();
        const timestamp = now.getTime();
        const randomString = Math.random().toString(36).substring(2, 6);
        const response = await axios_1.default.head(url);
        const mimeType = response.headers['content-type'];
        let fileExtension = '';
        if (mimeType) {
            const mimeTypeMap = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'image/bmp': 'bmp',
                'image/svg+xml': 'svg',
                'image/tiff': 'tiff',
                'image/x-icon': 'ico',
                'video/mp4': 'mp4',
                'video/mpeg': 'mpeg',
                'video/ogg': 'ogv',
                'video/webm': 'webm',
                'video/quicktime': 'mov',
                'video/x-msvideo': 'avi',
                'video/x-flv': 'flv',
                'audio/mpeg': 'mp3',
                'audio/ogg': 'ogg',
                'audio/wav': 'wav',
                'audio/x-wav': 'wav',
                'audio/webm': 'weba',
                'application/pdf': 'pdf',
                'application/msword': 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                'application/vnd.ms-excel': 'xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                'application/vnd.ms-powerpoint': 'ppt',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
                'application/zip': 'zip',
                'application/x-rar-compressed': 'rar',
                'application/x-7z-compressed': '7z',
                'text/plain': 'txt',
                'text/html': 'html',
                'text/css': 'css',
                'text/javascript': 'js',
                'application/json': 'json',
                'application/xml': 'xml',
                'application/octet-stream': 'bin',
                'application/vnd.android.package-archive': 'apk',
                'application/x-sh': 'sh',
            };
            fileExtension = mimeTypeMap[mimeType] || '';
        }
        const filename = fileExtension
            ? `${timestamp}_${randomString}.${fileExtension}`
            : `${timestamp}_${randomString}`;
        common_1.Logger.debug(`准备上传文件: ${filename}, URL: ${url}, 目录: ${dir}`, 'UploadService');
        const { tencentCosStatus = 0, aliOssStatus = 0, cheveretoStatus = 0, } = await this.globalConfigService.getConfigs([
            'tencentCosStatus',
            'aliOssStatus',
            'cheveretoStatus',
        ]);
        if (!Number(tencentCosStatus) &&
            !Number(aliOssStatus) &&
            !Number(cheveretoStatus)) {
            throw new common_1.HttpException('请先前往后台配置上传图片的方式', common_1.HttpStatus.BAD_REQUEST);
        }
        if (Number(tencentCosStatus)) {
            return this.uploadFileByTencentCosFromUrl({ filename, url, dir });
        }
        if (Number(aliOssStatus)) {
            const res = await this.uploadFileByAliOssFromUrl({ filename, url, dir });
            return res;
        }
        if (Number(cheveretoStatus)) {
            return await this.uploadFileByCheveretoFromUrl({ filename, url, dir });
        }
    }
    async uploadFileByTencentCos({ filename, buffer, dir, fileType }) {
        const { Bucket, Region, SecretId, SecretKey } = await this.getUploadConfig('tencent');
        this.tencentCos = new TENCENTCOS({
            SecretId,
            SecretKey,
            FileParallelLimit: 10,
        });
        try {
            return new Promise(async (resolve, reject) => {
                const type = fileType || 'png';
                this.tencentCos.putObject({
                    Bucket: (0, utils_1.removeSpecialCharacters)(Bucket),
                    Region: (0, utils_1.removeSpecialCharacters)(Region),
                    Key: `${dir}/${filename || `${(0, utils_1.createRandomUid)()}.${fileType}`}`,
                    StorageClass: 'STANDARD',
                    Body: buffer,
                }, async (err, data) => {
                    if (err) {
                        console.log('cos -> err: ', err);
                        return reject(err);
                    }
                    let locationUrl = data.Location.replace(/^(http:\/\/|https:\/\/|\/\/|)(.*)/, 'https://$2');
                    const { acceleratedDomain } = await this.getUploadConfig('tencent');
                    if (acceleratedDomain) {
                        locationUrl = locationUrl.replace(/^(https:\/\/[^/]+)(\/.*)$/, `https://${acceleratedDomain}$2`);
                        console.log('当前已开启全球加速----------------->', locationUrl);
                    }
                    return resolve(locationUrl);
                });
            });
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException('上传图片失败[ten]', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileByTencentCosFromUrl({ filename, url, dir }) {
        const { Bucket, Region, SecretId, SecretKey } = await this.getUploadConfig('tencent');
        this.tencentCos = new TENCENTCOS({
            SecretId,
            SecretKey,
            FileParallelLimit: 10,
        });
        try {
            const buffer = await this.getBufferFromUrl(url);
            return await this.uploadFileByTencentCos({
                filename,
                buffer,
                dir,
                fileType: '',
            });
        }
        catch (error) {
            console.log('TODO->error:  ', error);
            throw new common_1.HttpException('上传图片失败[ten][url]', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileByAliOss({ filename, buffer, dir, fileType = 'png' }) {
        const { region, bucket, accessKeyId, accessKeySecret } = await this.getUploadConfig('ali');
        const client = new ALIOSS({
            region: (0, utils_1.removeSpecialCharacters)(region),
            accessKeyId,
            accessKeySecret,
            bucket: (0, utils_1.removeSpecialCharacters)(bucket),
        });
        try {
            console.log('ali 开始上传');
            return new Promise((resolve, reject) => {
                client
                    .put(`${dir}/${filename || `${(0, utils_1.createRandomUid)()}.${fileType}`}`, buffer)
                    .then(async (result) => {
                    const { acceleratedDomain } = await this.getUploadConfig('ali');
                    if (acceleratedDomain) {
                        result.url = result.url.replace(/^(https:\/\/[^/]+)(\/.*)$/, `https://${acceleratedDomain}$2`);
                        console.log('当前已开启全球加速----------------->', result.url);
                    }
                    resolve(result.url);
                })
                    .catch((err) => {
                    reject(err);
                });
            });
        }
        catch (error) {
            throw new common_1.HttpException('上传图片失败[ali]', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileToLocalFromUrl({ filename, url, dir }) {
        try {
            const buffer = await this.getBufferFromUrl(url);
            return await this.uploadFileToLocal({ filename, buffer, dir });
        }
        catch (error) {
            console.log('TODO->error:  ', error);
            throw new common_1.HttpException('上传图片失败[ten][url]', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileToLocal({ filename, buffer, dir = 'ai' }) {
        if (!filename || !buffer) {
            throw new Error('必须提供文件名和文件内容');
        }
        const appRoot = require('app-root-path');
        const uploadDir = path_1.default.join(appRoot.path, 'service', 'public', 'file');
        const filePath = path_1.default.join(uploadDir, filename);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            common_1.Logger.log(`创建目录: ${uploadDir}`);
        }
        fs.writeFileSync(filePath, buffer);
        common_1.Logger.log(`文件已保存: ${filePath}`);
        const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:9520';
        const fileUrl = `${baseUrl}/file/${filename}`;
        common_1.Logger.log(`文件可访问于: ${fileUrl}`);
        return fileUrl;
    }
    async uploadFileByAliOssFromUrl({ filename, url, dir }) {
        const { region, bucket, accessKeyId, accessKeySecret } = await this.getUploadConfig('ali');
        const client = new ALIOSS({ region, accessKeyId, accessKeySecret, bucket });
        try {
            const buffer = await this.getBufferFromUrl(url);
            return await this.uploadFileByAliOss({ filename, buffer, dir });
        }
        catch (error) {
            throw new common_1.HttpException('上传图片失败[ALI][url]', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileByChevereto({ filename = '', buffer, dir = 'ai', fileType = 'png', }) {
        var _a;
        const { key, uploadPath } = await this.getUploadConfig('chevereto');
        let url = uploadPath.endsWith('/') ? uploadPath.slice(0, -1) : uploadPath;
        const formData = new FormData();
        const fromBuffer = buffer.toString('base64');
        formData.append('source', fromBuffer);
        formData.append('key', key);
        formData.append('title', filename);
        try {
            const res = await axios_1.default.post(url, formData, {
                headers: { 'X-API-Key': key },
            });
            if ((res === null || res === void 0 ? void 0 : res.status) === 200) {
                return res.data.image.url;
            }
            else {
                console.log('Chevereto ---> res', res === null || res === void 0 ? void 0 : res.data.code, res === null || res === void 0 ? void 0 : res.data.error.message);
                common_1.Logger.error('上传图片失败[Chevereto]', JSON.stringify(res.data));
            }
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException(`上传图片失败[Chevereto|buffer] --> ${(_a = error.response) === null || _a === void 0 ? void 0 : _a.data.error.message}`, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async uploadFileByCheveretoFromUrl({ filename, url, dir }) {
        try {
            const buffer = await this.getBufferFromUrl(url);
            return await this.uploadFileByChevereto({ filename, buffer, dir });
        }
        catch (error) {
            console.log('error: ', error);
            throw new common_1.HttpException(error.response, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async getUploadConfig(type) {
        if (type === 'ali') {
            const { aliOssRegion: region, aliOssBucket: bucket, aliOssAccessKeyId: accessKeyId, aliOssAccessKeySecret: accessKeySecret, aliOssAcceleratedDomain: acceleratedDomain, } = await this.globalConfigService.getConfigs([
                'aliOssRegion',
                'aliOssBucket',
                'aliOssAccessKeyId',
                'aliOssAccessKeySecret',
                'acceleratedDomain',
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
        if (type === 'chevereto') {
            const { cheveretoKey: key, cheveretoUploadPath: uploadPath } = await this.globalConfigService.getConfigs([
                'cheveretoKey',
                'cheveretoUploadPath',
            ]);
            return { key, uploadPath };
        }
    }
    async getBufferFromUrl(url) {
        const response = await axios_1.default.get(url, { responseType: 'stream' });
        return new Promise((resolve, reject) => {
            streamToBuffer(response.data, (err, buffer) => {
                if (err) {
                    throw new common_1.HttpException('获取图片资源失败、请重新试试吧！', common_1.HttpStatus.BAD_REQUEST);
                }
                else {
                    resolve(buffer);
                }
            });
        });
    }
};
UploadService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], UploadService);
exports.UploadService = UploadService;
