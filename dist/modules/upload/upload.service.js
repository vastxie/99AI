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
const fs_1 = require("fs");
const mime = require("mime-types");
const path = require("path");
const streamToBuffer = require("stream-to-buffer");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const blacklist = ['exe', 'sh', 'bat', 'js', 'php', 'py'];
let UploadService = class UploadService {
    constructor(globalConfigService) {
        this.globalConfigService = globalConfigService;
    }
    onModuleInit() { }
    async uploadFile(file, dir = 'others') {
        const { buffer, mimetype } = file;
        if (process.env.ISDEV === 'TRUE') {
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
        const { tencentCosStatus = 0, aliOssStatus = 0, cheveretoStatus = 0, localStorageStatus = 0, } = await this.globalConfigService.getConfigs([
            'tencentCosStatus',
            'aliOssStatus',
            'cheveretoStatus',
            'localStorageStatus',
        ]);
        common_1.Logger.log(`上传配置状态 - 腾讯云:本地存储: ${localStorageStatus}, ${tencentCosStatus}, 阿里云: ${aliOssStatus}, Chevereto: ${cheveretoStatus}`, 'UploadService');
        if (!Number(tencentCosStatus) &&
            !Number(aliOssStatus) &&
            !Number(cheveretoStatus) &&
            !Number(localStorageStatus)) {
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
        if (process.env.ISDEV === 'TRUE') {
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
    async uploadFileByAliOss({ filename, buffer, dir }) {
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
                    .put(`${dir}/${filename}`, buffer)
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
UploadService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [globalConfig_service_1.GlobalConfigService])
], UploadService);
exports.UploadService = UploadService;
