import { formatUrl, removeSpecialCharacters } from '@/common/utils';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as ALIOSS from 'ali-oss';
import axios from 'axios';
import * as TENCENTCOS from 'cos-nodejs-sdk-v5';
import * as FormData from 'form-data';
// import * as fs from 'fs';
import { promises as fs } from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import * as streamToBuffer from 'stream-to-buffer';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
const blacklist = ['exe', 'sh', 'bat', 'js', 'php', 'py']; // 黑名单

@Injectable()
export class UploadService implements OnModuleInit {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
  ) {}
  private tencentCos: any;

  onModuleInit() {}

  // 检查用户上传频率
  private async checkUploadFrequency(userId: number): Promise<void> {
    const hourlyKey = `upload:frequency:${userId}:${new Date().getHours()}`;

    // 获取当前小时的上传次数
    const uploadCount = await this.redisCacheService.get({ key: hourlyKey });
    const count = uploadCount ? parseInt(uploadCount) : 0;

    Logger.log(`用户${userId}当前小时上传次数: ${count}`, 'UploadService');

    // 检查是否超过限制(1小时100次)
    if (count >= 100) {
      throw new HttpException('您的上传频率过高，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 更新上传次数，设置过期时间为1小时
    await this.redisCacheService.set({ key: hourlyKey, val: (count + 1).toString() }, 3600);
  }

  async uploadFile(file, dir = 'others', user = null) {
    // 如果存在用户信息，则进行频率检查
    if (user && user.id) {
      await this.checkUploadFrequency(user.id);
    }

    const { buffer, mimetype } = file;

    if (process.env.ISDEV === 'true') {
      dir = `dev/${dir}`;
    }
    // 使用 mime-types 库获取文件扩展名
    const fileExtension = mime.extension(mimetype) || '';
    if (!fileExtension) {
      Logger.error('无法识别文件类型，请检查文件', 'UploadService');

      // throw new HttpException(
      //   '无法识别文件类型，请检查文件',
      //   HttpStatus.UNSUPPORTED_MEDIA_TYPE
      // );
    }

    // 检查文件扩展名是否在黑名单中
    if (blacklist.includes(fileExtension.toLowerCase())) {
      Logger.error('不允许上传此类型的文件', 'UploadService');
      throw new Error('不允许上传此类型的文件');
    }

    const now = new Date();
    const timestamp = now.getTime(); // 获取当前时间的时间戳
    const randomString = Math.random().toString(36).substring(2, 6); // 生成4位随机字符串
    const filename = `${timestamp}_${randomString}.${fileExtension}`; // 生成新的文件名，并添加文件后缀

    const {
      tencentCosStatus = 0,
      aliOssStatus = 0,
      cheveretoStatus = 0,
      localStorageStatus = 0,
      s3Status = 0,
    } = await this.globalConfigService.getConfigs([
      'tencentCosStatus',
      'aliOssStatus',
      'cheveretoStatus',
      'localStorageStatus',
      's3Status',
    ]);

    Logger.log(
      `上传配置状态 - 本地存储: ${localStorageStatus}, S3: ${s3Status}, 腾讯云: ${tencentCosStatus}, 阿里云: ${aliOssStatus}, Chevereto: ${cheveretoStatus}`,
      'UploadService',
    );

    if (
      !Number(tencentCosStatus) &&
      !Number(aliOssStatus) &&
      !Number(cheveretoStatus) &&
      !Number(localStorageStatus) &&
      !Number(s3Status)
    ) {
      Logger.error('未配置任何上传方式', 'UploadService');
      throw new HttpException('请先前往后台配置上传图片的方式', HttpStatus.BAD_REQUEST);
    }

    try {
      if (Number(localStorageStatus)) {
        Logger.log('使用本地存储上传文件', 'UploadService');
        const result = await this.uploadFileToLocal({ filename, buffer, dir });
        Logger.log(`文件已上传到本地存储。访问 URL: ${result}`, 'UploadService');
        return result;
      }
      if (Number(s3Status)) {
        Logger.log('使用 S3 上传文件', 'UploadService');
        const result = await this.uploadFileByS3({ filename, buffer, dir });
        Logger.log(`文件已上传到 S3。访问 URL: ${result}`, 'UploadService');
        return result;
      }
      if (Number(tencentCosStatus)) {
        Logger.log('使用腾讯云 COS 上传文件', 'UploadService');
        const result = await this.uploadFileByTencentCos({
          filename,
          buffer,
          dir,
        });
        Logger.log(`文件已上传到腾讯云 COS。访问 URL: ${result}`, 'UploadService');
        return result;
      }
      if (Number(aliOssStatus)) {
        Logger.log('使用阿里云 OSS 上传文件', 'UploadService');
        const result = await this.uploadFileByAliOss({
          filename,
          buffer,
          dir,
        });
        Logger.log(`文件已上传到阿里云 OSS。访问 URL: ${result}`, 'UploadService');
        return result;
      }
      if (Number(cheveretoStatus)) {
        Logger.log('使用 Chevereto 上传文件', 'UploadService');
        const result = await this.uploadFileByChevereto({
          filename,
          buffer: buffer.toString('base64'),
        });
        Logger.log(`文件已上传到 Chevereto。访问 URL: ${result}`, 'UploadService');
        return result;
      }
    } catch (error) {
      Logger.error(`上传失败: ${error.message}`, 'UploadService');
      throw error; // 重新抛出异常，以便调用方可以处理
    }
  }

  async getUploadType() {
    const {
      tencentCosStatus = 0,
      aliOssStatus = 0,
      cheveretoStatus = 0,
      s3Status = 0,
    } = await this.globalConfigService.getConfigs([
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

  /* 通过腾讯云上传图片 */
  async uploadFileByTencentCos({ filename, buffer, dir }) {
    const { Bucket, Region, SecretId, SecretKey } = await this.getUploadConfig('tencent');
    this.tencentCos = new TENCENTCOS({
      SecretId,
      SecretKey,
      FileParallelLimit: 10,
    });
    try {
      return new Promise(async (resolve, reject) => {
        this.tencentCos.putObject(
          {
            Bucket: removeSpecialCharacters(Bucket),
            Region: removeSpecialCharacters(Region),
            Key: `${dir}/${filename}`,
            StorageClass: 'STANDARD',
            Body: buffer,
          },
          async (err, data) => {
            if (err) {
              Logger.error(`腾讯云COS上传失败: ${err.message}`, 'UploadService');
              return reject(err);
            }
            let locationUrl = data.Location.replace(
              /^(http:\/\/|https:\/\/|\/\/|)(.*)/,
              'https://$2',
            );
            const { acceleratedDomain } = await this.getUploadConfig('tencent');
            if (acceleratedDomain) {
              locationUrl = locationUrl.replace(
                /^(https:\/\/[^/]+)(\/.*)$/,
                `https://${acceleratedDomain}$2`,
              );
              Logger.log(`腾讯云COS已开启全球加速: ${locationUrl}`, 'UploadService');
            }
            return resolve(locationUrl);
          },
        );
      });
    } catch (error) {
      Logger.error(`腾讯云COS上传异常: ${error.message}`, 'UploadService');
      throw new HttpException('上传图片失败[ten]', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过阿里云上传图片 */
  async uploadFileByAliOss({ filename, buffer, dir }) {
    const { region, bucket, accessKeyId, accessKeySecret } = await this.getUploadConfig('ali');
    const client = new ALIOSS({
      region: removeSpecialCharacters(region),
      accessKeyId,
      accessKeySecret,
      bucket: removeSpecialCharacters(bucket),
      authorizationV4: true, // 使用V4签名算法，提供更高的安全性
      secure: true,
    });
    try {
      Logger.log('阿里云OSS开始上传', 'UploadService');
      return new Promise((resolve, reject) => {
        client
          .put(`${dir}/${filename}`, buffer)
          .then(async result => {
            const { acceleratedDomain } = await this.getUploadConfig('ali');
            if (acceleratedDomain) {
              result.url = result.url.replace(
                /^(https:\/\/[^/]+)(\/.*)$/,
                `https://${acceleratedDomain}$2`,
              );
              Logger.log(`阿里云OSS已开启全球加速: ${result.url}`, 'UploadService');
            }
            resolve(result.url);
          })
          .catch(err => {
            reject(err);
          });
      });
    } catch (error) {
      throw new HttpException('上传图片失败[ali]', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过S3上传文件 */
  async uploadFileByS3({ filename, buffer, dir }) {
    const { region, bucket, accessKeyId, secretAccessKey, endpoint, customDomain } =
      await this.getUploadConfig('s3');

    const s3Config: any = {
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    // 区域配置：如果没有设置，使用默认值 'us-east-1'
    // AWS SDK 要求必须有区域，即使是 S3 兼容服务
    if (region) {
      s3Config.region = removeSpecialCharacters(region);
    } else {
      // 为 S3 兼容服务提供默认区域，避免 SDK 报错
      s3Config.region = 'us-east-1';
    }

    // 如果有自定义端点（支持MinIO等S3兼容服务）
    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true; // MinIO等服务通常需要路径样式
    }

    const s3Client = new S3Client(s3Config);

    try {
      Logger.log(
        `S3 开始上传 - 区域: ${s3Config.region}, 存储桶: ${bucket}, 端点: ${endpoint || '默认'}`,
        'UploadService',
      );

      const command = new PutObjectCommand({
        Bucket: removeSpecialCharacters(bucket),
        Key: `${dir}/${filename}`,
        Body: buffer,
        ContentType: mime.lookup(filename) || 'application/octet-stream',
      });

      const result = await s3Client.send(command);

      // 构建文件访问URL
      let fileUrl: string;
      if (customDomain) {
        // 使用自定义域名（CDN等）
        fileUrl = `https://${customDomain}/${dir}/${filename}`;
      } else if (endpoint) {
        // 使用自定义端点
        const endpointUrl = endpoint.replace(/^https?:\/\//, '');
        fileUrl = `https://${endpointUrl}/${bucket}/${dir}/${filename}`;
      } else if (region) {
        // 使用标准AWS S3 URL（需要区域）
        fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${dir}/${filename}`;
      } else {
        // 默认S3 URL格式（无区域）
        fileUrl = `https://${bucket}.s3.amazonaws.com/${dir}/${filename}`;
      }

      Logger.log(`S3上传成功: ${fileUrl}`, 'UploadService');
      return fileUrl;
    } catch (error) {
      Logger.error(`S3上传失败: ${error.message}`, 'UploadService');
      Logger.error(
        `S3配置详情 - 区域: ${s3Config.region}, 存储桶: ${bucket}, 端点: ${
          endpoint || '默认'
        }, 访问密钥: ${accessKeyId ? '已设置' : '未设置'}`,
        'UploadService',
      );
      throw new HttpException(`上传文件失败[S3]: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  // 假设 uploadFileToLocal 是类的一个方法
  async uploadFileToLocal({ filename, buffer, dir = 'others' }) {
    // 确保目录和文件名没有非法字符
    const normalizedDir = path.normalize(dir).replace(/^(\.\.(\/|\\|$))+/, '');
    const normalizedFilename = path.basename(filename);

    const projectRoot = process.cwd(); // 获取项目根目录
    const uploadDir = path.join(projectRoot, 'public', 'file', normalizedDir);
    const filePath = path.join(uploadDir, normalizedFilename);

    // 确保最终路径在预期的目录内
    if (!filePath.startsWith(path.join(projectRoot, 'public', 'file'))) {
      throw new Error('非法路径，禁止访问目录之外的位置');
    }

    // 确保目录存在
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (err) {
      Logger.error(`创建目录失败: ${uploadDir}`, err);
      throw err;
    }

    // // 将文件buffer写入到指定路径
    // try {
    //   await fs.writeFile(filePath, buffer);
    // } catch (err) {
    //   Logger.error(`文件保存失败: ${filePath}`, err);
    //   throw err;
    // }

    // 将文件buffer写入到指定路径并设置为只读
    try {
      await fs.writeFile(filePath, buffer, { mode: 0o444 }); // 设置文件为只读
    } catch (err) {
      Logger.error(`文件保存失败: ${filePath}`, err);
      throw err;
    }

    // 使用环境变量中定义的基础URL来构建完整的文件访问URL
    let fileUrl = `file/${normalizedDir}/${normalizedFilename}`;
    const siteUrl = await this.globalConfigService.getConfigs(['siteUrl']);
    if (siteUrl) {
      const url = formatUrl(siteUrl);
      fileUrl = `${url}/${fileUrl}`;
    }
    // 返回文件访问的URL
    return fileUrl;
  }

  /* 通过三方图床上传图片 */
  async uploadFileByChevereto({ filename = '', buffer }) {
    const { key, uploadPath } = await this.getUploadConfig('chevereto');
    const url = uploadPath.endsWith('/') ? uploadPath.slice(0, -1) : uploadPath;
    const formData = new FormData();
    const fromBuffer = buffer.toString('base64');
    formData.append('source', fromBuffer);
    formData.append('key', key);
    formData.append('title', filename);
    try {
      const res = await axios.post(url, formData, {
        headers: { 'X-API-Key': key },
      });
      if (res?.status === 200) {
        return res.data.image.url;
      } else {
        Logger.error(
          `Chevereto上传失败 - 状态码: ${res?.data.code}, 错误信息: ${res?.data.error.message}`,
          'UploadService',
        );
        Logger.error('上传图片失败[Chevereto]', JSON.stringify(res.data));
      }
    } catch (error) {
      Logger.error(`Chevereto上传异常: ${error.message}`, 'UploadService');
      throw new HttpException(
        `上传图片失败[Chevereto|buffer] --> ${error.response?.data.error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* 获取cos上传配置 */
  async getUploadConfig(type) {
    if (type === 'ali') {
      const {
        aliOssRegion: region,
        aliOssBucket: bucket,
        aliOssAccessKeyId: accessKeyId,
        aliOssAccessKeySecret: accessKeySecret,
        aliOssAcceleratedDomain: acceleratedDomain,
      } = await this.globalConfigService.getConfigs([
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
      const {
        cosBucket: Bucket,
        cosRegion: Region,
        cosSecretId: SecretId,
        cosSecretKey: SecretKey,
        tencentCosAcceleratedDomain: acceleratedDomain,
      } = await this.globalConfigService.getConfigs([
        'cosBucket',
        'cosRegion',
        'cosSecretId',
        'cosSecretKey',
        'tencentCosAcceleratedDomain',
      ]);
      return { Bucket, Region, SecretId, SecretKey, acceleratedDomain };
    }
    if (type === 's3') {
      const {
        s3Region: region,
        s3Bucket: bucket,
        s3AccessKeyId: accessKeyId,
        s3SecretAccessKey: secretAccessKey,
        s3Endpoint: endpoint,
        s3CustomDomain: customDomain,
      } = await this.globalConfigService.getConfigs([
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
      const { cheveretoKey: key, cheveretoUploadPath: uploadPath } =
        await this.globalConfigService.getConfigs(['cheveretoKey', 'cheveretoUploadPath']);
      return { key, uploadPath };
    }
  }

  async getBufferFromUrl(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const response = await axios.get(url, { responseType: 'stream' });

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      streamToBuffer(response.data, (err, buffer) => {
        if (err) {
          reject(new HttpException('获取图片资源失败，请重新试试吧！', HttpStatus.BAD_REQUEST));
        } else {
          resolve(buffer);
        }
      });
    });

    const mimeType = response.headers['content-type'];
    return { buffer, mimeType };
  }
}
