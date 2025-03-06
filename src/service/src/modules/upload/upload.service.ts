import { formatUrl, removeSpecialCharacters } from '@/common/utils';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
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
const blacklist = ['exe', 'sh', 'bat', 'js', 'php', 'py']; // 黑名单

@Injectable()
export class UploadService implements OnModuleInit {
  constructor(private readonly globalConfigService: GlobalConfigService) {}
  private tencentCos: any;

  onModuleInit() {}

  async uploadFile(file, dir = 'others') {
    const { buffer, mimetype } = file;

    if (process.env.ISDEV === 'TRUE') {
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
    } = await this.globalConfigService.getConfigs([
      'tencentCosStatus',
      'aliOssStatus',
      'cheveretoStatus',
      'localStorageStatus',
    ]);

    Logger.log(
      `上传配置状态 - 腾讯云:本地存储: ${localStorageStatus}, ${tencentCosStatus}, 阿里云: ${aliOssStatus}, Chevereto: ${cheveretoStatus}`,
      'UploadService'
    );

    if (
      !Number(tencentCosStatus) &&
      !Number(aliOssStatus) &&
      !Number(cheveretoStatus) &&
      !Number(localStorageStatus)
    ) {
      Logger.error('未配置任何上传方式', 'UploadService');
      throw new HttpException(
        '请先前往后台配置上传图片的方式',
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      if (Number(localStorageStatus)) {
        Logger.log('使用本地存储上传文件', 'UploadService');
        const result = await this.uploadFileToLocal({ filename, buffer, dir });
        Logger.log(
          `文件已上传到本地存储。访问 URL: ${result}`,
          'UploadService'
        );
        return result;
      }
      if (Number(tencentCosStatus)) {
        Logger.log('使用腾讯云 COS 上传文件', 'UploadService');
        const result = await this.uploadFileByTencentCos({
          filename,
          buffer,
          dir,
        });
        Logger.log(
          `文件已上传到腾讯云 COS。访问 URL: ${result}`,
          'UploadService'
        );
        return result;
      }
      if (Number(aliOssStatus)) {
        Logger.log('使用阿里云 OSS 上传文件', 'UploadService');
        const result = await this.uploadFileByAliOss({
          filename,
          buffer,
          dir,
        });
        Logger.log(
          `文件已上传到阿里云 OSS。访问 URL: ${result}`,
          'UploadService'
        );
        return result;
      }
      if (Number(cheveretoStatus)) {
        Logger.log('使用 Chevereto 上传文件', 'UploadService');
        const result = await this.uploadFileByChevereto({
          filename,
          buffer: buffer.toString('base64'),
        });
        Logger.log(
          `文件已上传到 Chevereto。访问 URL: ${result}`,
          'UploadService'
        );
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
    } = await this.globalConfigService.getConfigs([
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

  /* 通过腾讯云上传图片 */
  async uploadFileByTencentCos({ filename, buffer, dir }) {
    const { Bucket, Region, SecretId, SecretKey } = await this.getUploadConfig(
      'tencent'
    );
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
              console.log('cos -> err: ', err);
              return reject(err);
            }
            let locationUrl = data.Location.replace(
              /^(http:\/\/|https:\/\/|\/\/|)(.*)/,
              'https://$2'
            );
            const { acceleratedDomain } = await this.getUploadConfig('tencent');
            if (acceleratedDomain) {
              locationUrl = locationUrl.replace(
                /^(https:\/\/[^/]+)(\/.*)$/,
                `https://${acceleratedDomain}$2`
              );
              console.log('当前已开启全球加速----------------->', locationUrl);
            }
            return resolve(locationUrl);
          }
        );
      });
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException('上传图片失败[ten]', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过阿里云上传图片 */
  async uploadFileByAliOss({ filename, buffer, dir }) {
    const { region, bucket, accessKeyId, accessKeySecret } =
      await this.getUploadConfig('ali');
    const client = new ALIOSS({
      region: removeSpecialCharacters(region),
      accessKeyId,
      accessKeySecret,
      bucket: removeSpecialCharacters(bucket),
      authorizationV4: true,
      secure: true,
    });
    try {
      console.log('ali 开始上传');
      return new Promise((resolve, reject) => {
        client
          .put(`${dir}/${filename}`, buffer)
          .then(async (result) => {
            const { acceleratedDomain } = await this.getUploadConfig('ali');
            if (acceleratedDomain) {
              result.url = result.url.replace(
                /^(https:\/\/[^/]+)(\/.*)$/,
                `https://${acceleratedDomain}$2`
              );
              console.log('当前已开启全球加速----------------->', result.url);
            }
            resolve(result.url);
          })
          .catch((err) => {
            reject(err);
          });
      });
    } catch (error) {
      throw new HttpException('上传图片失败[ali]', HttpStatus.BAD_REQUEST);
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
    let url = uploadPath.endsWith('/') ? uploadPath.slice(0, -1) : uploadPath;
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
        console.log(
          'Chevereto ---> res',
          res?.data.code,
          res?.data.error.message
        );
        Logger.error('上传图片失败[Chevereto]', JSON.stringify(res.data));
      }
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException(
        `上传图片失败[Chevereto|buffer] --> ${error.response?.data.error.message}`,
        HttpStatus.BAD_REQUEST
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
    if (type === 'chevereto') {
      const { cheveretoKey: key, cheveretoUploadPath: uploadPath } =
        await this.globalConfigService.getConfigs([
          'cheveretoKey',
          'cheveretoUploadPath',
        ]);
      return { key, uploadPath };
    }
  }

  async getBufferFromUrl(
    url: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const response = await axios.get(url, { responseType: 'stream' });

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      streamToBuffer(response.data, (err, buffer) => {
        if (err) {
          reject(
            new HttpException(
              '获取图片资源失败，请重新试试吧！',
              HttpStatus.BAD_REQUEST
            )
          );
        } else {
          resolve(buffer);
        }
      });
    });

    const mimeType = response.headers['content-type'];
    return { buffer, mimeType };
  }
}
