import * as crypto from 'crypto';

/**
 * 豆包签名配置接口
 */
export interface DoubaoSignatureConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
}

/**
 * 签名结果接口
 */
export interface SignatureResult {
  authorization: string;
  xDate: string;
  headers: Record<string, string>;
}

/**
 * 豆包（火山引擎）API签名工具类
 * 完全按照官方文档的标准HMAC-SHA256签名算法实现
 */
export class DoubaoSignature {
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;
  private service: string;

  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    region: string = 'cn-north-1',
    service: string = 'cv',
  ) {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
    this.service = service;
  }

  /**
   * 生成UTC时间字符串
   * @returns ISO 8601格式的UTC时间字符串 (YYYYMMDD'T'HHMMSS'Z')
   */
  private generateTimestamp(): string {
    const now = new Date();
    return now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  }

  /**
   * 获取日期字符串 (YYYYMMDD)
   * @param timestamp 时间戳
   * @returns 日期字符串
   */
  private getDateString(timestamp: string): string {
    return timestamp.substring(0, 8);
  }

  /**
   * URI编码（按照火山引擎标准）
   * @param str 要编码的字符串
   * @returns 编码后的字符串
   */
  private uriEscape(str: string): string {
    return encodeURIComponent(str).replace(
      /[!'()*]/g,
      c => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    );
  }

  /**
   * 计算SHA256哈希
   * @param data 数据
   * @returns 十六进制哈希值
   */
  private sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * 计算HMAC-SHA256
   * @param key 密钥
   * @param data 数据
   * @returns Buffer
   */
  private hmacSha256(key: string | Buffer, data: string): Buffer {
    return crypto
      .createHmac('sha256', key as any)
      .update(data, 'utf8')
      .digest();
  }

  /**
   * 构建规范请求字符串（按照官方示例优化）
   * @param method HTTP方法
   * @param uri 请求URI
   * @param queryParams 查询参数
   * @param headers 请求头
   * @param payload 请求体
   * @returns 规范请求字符串
   */
  private buildCanonicalRequest(
    method: string,
    uri: string,
    queryParams: Record<string, any>,
    headers: Record<string, string>,
    payload: string,
  ): { canonicalRequest: string; signedHeaders: string } {
    // 1. HTTP方法
    const httpMethod = method.toUpperCase();

    // 2. 规范URI
    const canonicalUri = uri || '/';

    // 3. 规范查询字符串（按照官方示例格式）
    const sortedParams = Object.keys(queryParams)
      .sort()
      .map(key => `${this.uriEscape(key)}=${this.uriEscape(queryParams[key])}`)
      .join('&');

    // 4. 计算请求体哈希（用于 x-content-sha256 头部）
    const payloadHash = this.sha256(payload);

    // 5. 按照官方示例，只包含特定的头部进行签名
    // 官方示例只包含: host, x-content-sha256, x-date
    const signedHeadersMap: Record<string, string> = {};

    // 添加必需的头部
    if (headers['host'] || headers['Host']) {
      signedHeadersMap['host'] = (headers['host'] || headers['Host']).trim();
    }

    if (headers['x-date']) {
      signedHeadersMap['x-date'] = headers['x-date'].trim();
    }

    // 添加 x-content-sha256
    signedHeadersMap['x-content-sha256'] = payloadHash;

    // 6. 按字母顺序排序头部键
    const sortedHeaderKeys = Object.keys(signedHeadersMap).sort();
    const canonicalHeaders =
      sortedHeaderKeys.map(key => `${key}:${signedHeadersMap[key]}`).join('\n') + '\n';

    // 7. 签名头部
    const signedHeaders = sortedHeaderKeys.join(';');

    // 8. 构建规范请求（按照官方格式）
    const canonicalRequest = [
      httpMethod,
      canonicalUri,
      sortedParams,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // 规范请求构建完成

    return { canonicalRequest, signedHeaders };
  }

  /**
   * 构建待签字符串
   * @param timestamp 时间戳
   * @param canonicalRequest 规范请求
   * @returns 待签字符串
   */
  private buildStringToSign(timestamp: string, canonicalRequest: string): string {
    const algorithm = 'HMAC-SHA256';
    const requestDate = timestamp;
    const credentialScope = `${this.getDateString(timestamp)}/${this.region}/${
      this.service
    }/request`;
    const hashedCanonicalRequest = this.sha256(canonicalRequest);

    const stringToSign = [algorithm, requestDate, credentialScope, hashedCanonicalRequest].join(
      '\n',
    );

    // 待签字符串构建完成

    return stringToSign;
  }

  /**
   * 计算签名密钥
   * @param timestamp 时间戳
   * @returns 签名密钥
   */
  private calculateSigningKey(timestamp: string): Buffer {
    const dateString = this.getDateString(timestamp);

    // kSecret = Your Secret Access Key
    const kSecret = this.secretAccessKey;

    // kDate = HMAC(kSecret, Date)
    const kDate = this.hmacSha256(kSecret, dateString);

    // kRegion = HMAC(kDate, Region)
    const kRegion = this.hmacSha256(kDate, this.region);

    // kService = HMAC(kRegion, Service)
    const kService = this.hmacSha256(kRegion, this.service);

    // kSigning = HMAC(kService, "request")
    const kSigning = this.hmacSha256(kService, 'request');

    // 签名密钥计算完成

    return kSigning;
  }

  /**
   * 计算签名
   * @param signingKey 签名密钥
   * @param stringToSign 待签字符串
   * @returns 签名
   */
  private calculateSignature(signingKey: Buffer, stringToSign: string): string {
    const signature = crypto
      .createHmac('sha256', signingKey as any)
      .update(stringToSign, 'utf8')
      .digest('hex');
    // 签名计算完成
    return signature;
  }

  /**
   * 生成Authorization头部签名（按照官方示例优化）
   * @param method HTTP方法
   * @param uri 请求URI
   * @param queryParams 查询参数
   * @param headers 请求头（不包含Authorization）
   * @param payload 请求体
   * @param timestamp 可选的时间戳，不提供则自动生成
   * @returns 包含Authorization头部、X-Date和完整头部的对象
   */
  public generateHeaderSignature(
    method: string,
    uri: string,
    queryParams: Record<string, any> = {},
    headers: Record<string, string> = {},
    payload: string = '',
    timestamp?: string,
  ): { authorization: string; xDate: string; headers: Record<string, string> } {
    const xDate = timestamp || headers['x-date'] || this.generateTimestamp();

    // 确保headers中包含必要的头部
    const allHeaders = {
      ...headers,
      'x-date': xDate,
    };

    // 如果没有host头部，添加默认值
    if (!allHeaders['host'] && !allHeaders['Host']) {
      allHeaders['host'] = 'visual.volcengineapi.com';
    }

    // 豆包签名请求参数准备完成

    // 1. 构建规范请求
    const { canonicalRequest, signedHeaders } = this.buildCanonicalRequest(
      method,
      uri,
      queryParams,
      allHeaders,
      payload,
    );

    // 2. 构建待签字符串
    const stringToSign = this.buildStringToSign(xDate, canonicalRequest);

    // 3. 计算签名密钥
    const signingKey = this.calculateSigningKey(xDate);

    // 4. 计算签名
    const signature = this.calculateSignature(signingKey, stringToSign);

    // 5. 构建Authorization头部
    const credentialScope = `${this.getDateString(xDate)}/${this.region}/${this.service}/request`;
    const authorization = `HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // 6. 构建完整的请求头部（按照官方示例格式）
    const payloadHash = this.sha256(payload);
    const finalHeaders = {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Host: allHeaders['host'] || allHeaders['Host'],
      'X-Content-Sha256': payloadHash,
      'X-Date': xDate,
      // 不包含小写的 host，避免重复
    };

    // 豆包签名Authorization头部构建完成
    // 豆包签名最终头部构建完成

    return {
      authorization,
      xDate,
      headers: finalHeaders,
    };
  }

  /**
   * 验证签名是否有效
   * @param signature 要验证的签名
   * @param method HTTP方法
   * @param uri 请求URI
   * @param queryParams 查询参数
   * @param headers 请求头
   * @param payload 请求体
   * @param timestamp 时间戳
   * @returns 是否有效
   */
  public verifySignature(
    signature: string,
    method: string,
    uri: string,
    queryParams: Record<string, any> = {},
    headers: Record<string, string> = {},
    payload: string = '',
    timestamp: string,
  ): boolean {
    try {
      const { authorization } = this.generateHeaderSignature(
        method,
        uri,
        queryParams,
        headers,
        payload,
        timestamp,
      );
      const expectedSignature = authorization.split('Signature=')[1];
      return signature === expectedSignature;
    } catch (error) {
      console.error(`[DEBUG] 豆包签名 - 验证签名失败:`, error);
      return false;
    }
  }
}

/**
 * 创建豆包签名实例的工厂函数
 * @param accessKeyId 访问密钥ID
 * @param secretAccessKey 秘密访问密钥
 * @param region 区域，默认cn-north-1
 * @param service 服务名，默认cv
 * @returns DoubaoSignature实例
 */
export function createDoubaoSignature(
  accessKeyId: string,
  secretAccessKey: string,
  region: string = 'cn-north-1',
  service: string = 'cv',
): DoubaoSignature {
  return new DoubaoSignature(accessKeyId, secretAccessKey, region, service);
}

/**
 * 便捷的签名生成函数
 * @param config 签名配置
 * @param request 请求信息
 * @returns 签名结果
 */
export function generateDoubaoSignature(
  config: DoubaoSignatureConfig,
  request: {
    method: string;
    uri: string;
    queryParams?: Record<string, any>;
    headers?: Record<string, string>;
    payload?: string;
    host?: string;
  },
): SignatureResult {
  const signer = createDoubaoSignature(
    config.accessKeyId,
    config.secretAccessKey,
    config.region,
    config.service,
  );

  // 从headers中获取host，或使用传入的host，或使用默认值
  const host =
    request.headers?.['host'] ||
    request.headers?.['Host'] ||
    request.host ||
    'visual.volcengineapi.com';

  // 确保headers中包含正确的Host
  const headersWithHost = {
    ...request.headers,
    host: host,
  };

  console.log(`[DEBUG] 豆包签名调试 - Host: ${host}`);
  console.log(`[DEBUG] 豆包签名调试 - Headers: ${JSON.stringify(headersWithHost)}`);
  console.log(`[DEBUG] 豆包签名调试 - Payload: ${request.payload?.substring(0, 100)}...`);

  const {
    authorization,
    xDate,
    headers: signedHeaders,
  } = signer.generateHeaderSignature(
    request.method,
    request.uri,
    request.queryParams || {},
    headersWithHost,
    request.payload || '',
  );

  return { authorization, xDate, headers: signedHeaders };
}
