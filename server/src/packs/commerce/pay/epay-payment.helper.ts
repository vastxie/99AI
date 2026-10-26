import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { resolveEpayApiVersion } from './payment-config.helper';

/** processResponse 归一后的支付响应 */
export interface EpayProcessedResponse {
  url_qrcode: string | null;
  redirectUrl: string | null;
  channel: string;
  isRedirect: boolean;
  isWxMiniProgram?: boolean;
}

/* 易支付通用辅助类 */
export class EpayPaymentHelper {
  /* MD5签名（V1版本/通用易支付） */
  static signMD5(params: Record<string, unknown>, secret: string): string {
    const str =
      Object.keys(params)
        .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== '')
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&') + secret;
    return crypto.createHash('md5').update(str).digest('hex');
  }

  /* RSA签名（V2版本） */
  static signRSA(params: Record<string, unknown>, privateKey: string): string {
    // 按照参数名ASCII码从小到大排序
    const sortedKeys = Object.keys(params)
      .filter(
        k =>
          k !== 'sign' &&
          k !== 'sign_type' &&
          params[k] !== '' &&
          params[k] !== null &&
          params[k] !== undefined,
      )
      .sort();

    // 调试输出所有参数
    sortedKeys.forEach(key => {});

    // 组装待签名字符串
    const sortedParams = sortedKeys.map(k => `${k}=${params[k]}`).join('&');

    try {
      // 格式化私钥
      const formattedKey = this.formatPrivateKey(privateKey);

      // 使用SHA256WithRSA签名
      const sign = crypto.createSign('SHA256');
      sign.update(sortedParams, 'utf8');
      sign.end();

      const signature = sign.sign(formattedKey, 'base64');
      return signature;
    } catch (error) {
      Logger.error('易支付RSA签名失败', getErrorStack(error), 'EpayPaymentHelper');
      throw new Error(`易支付RSA签名失败: ${error.message}`);
    }
  }

  /* RSA验签 */
  static verifyRSA(params: Record<string, unknown>, signature: string, publicKey: string): boolean {
    const sortedKeys = Object.keys(params)
      .filter(
        k =>
          k !== 'sign' &&
          k !== 'sign_type' &&
          params[k] !== '' &&
          params[k] !== null &&
          params[k] !== undefined,
      )
      .sort();

    sortedKeys.forEach(key => {});

    const sortedParams = sortedKeys.map(k => `${k}=${params[k]}`).join('&');

    const verify = crypto.createVerify('SHA256');
    verify.update(sortedParams);
    verify.end();

    const formattedKey = this.formatPublicKey(publicKey);
    try {
      const result = verify.verify(formattedKey, signature, 'base64');
      return result;
    } catch (error) {
      Logger.error('RSA验签失败', getErrorStack(error), 'EpayPaymentHelper');
      return false;
    }
  }

  /* 格式化私钥 */
  private static formatPrivateKey(key: string): string {
    if (!key) {
      throw new Error('私钥不能为空');
    }

    // 如果已经包含完整的头尾标记，直接返回
    if (
      (key.includes('-----BEGIN PRIVATE KEY-----') && key.includes('-----END PRIVATE KEY-----')) ||
      (key.includes('-----BEGIN RSA PRIVATE KEY-----') &&
        key.includes('-----END RSA PRIVATE KEY-----'))
    ) {
      return key;
    }

    // 移除可能存在的不完整头尾标记
    let cleanKey = key
      .replace(/-----BEGIN [A-Z ]*KEY-----/g, '')
      .replace(/-----END [A-Z ]*KEY-----/g, '');

    // 移除所有空格、换行和其他空白字符
    cleanKey = cleanKey.replace(/[\r\n\s]/g, '');

    // 验证是否为有效的base64字符串
    if (!/^[A-Za-z0-9+/]+=*$/.test(cleanKey)) {
      throw new Error('私钥格式无效：包含非法字符');
    }

    // 每64个字符插入换行
    const formatted = cleanKey.match(/.{1,64}/g)?.join('\n') || '';

    // 尝试检测密钥类型并返回正确格式
    // PKCS1格式特征：通常以MII开头
    // PKCS8格式特征：通常以MIG或MIE开头
    const isProbablyPKCS1 = cleanKey.startsWith('MII');

    if (isProbablyPKCS1) {
      // 尝试PKCS1格式
      const pkcs1Key = `-----BEGIN RSA PRIVATE KEY-----\n${formatted}\n-----END RSA PRIVATE KEY-----`;
      try {
        const testSign = crypto.createSign('SHA256');
        testSign.update('test');
        testSign.end();
        testSign.sign(pkcs1Key, 'base64');
        return pkcs1Key;
      } catch (error) {
        // 如果PKCS1失败，尝试PKCS8
        const pkcs8Key = `-----BEGIN PRIVATE KEY-----\n${formatted}\n-----END PRIVATE KEY-----`;
        try {
          const testSign2 = crypto.createSign('SHA256');
          testSign2.update('test');
          testSign2.end();
          testSign2.sign(pkcs8Key, 'base64');
          return pkcs8Key;
        } catch (error2) {
          throw new Error(`私钥格式无效：无法识别的密钥格式。错误信息：${error2.message}`);
        }
      }
    } else {
      // 默认先尝试PKCS8格式
      const pkcs8Key = `-----BEGIN PRIVATE KEY-----\n${formatted}\n-----END PRIVATE KEY-----`;
      try {
        const testSign = crypto.createSign('SHA256');
        testSign.update('test');
        testSign.end();
        testSign.sign(pkcs8Key, 'base64');
        return pkcs8Key;
      } catch (error) {
        // 如果PKCS8失败，尝试PKCS1
        const pkcs1Key = `-----BEGIN RSA PRIVATE KEY-----\n${formatted}\n-----END RSA PRIVATE KEY-----`;
        try {
          const testSign2 = crypto.createSign('SHA256');
          testSign2.update('test');
          testSign2.end();
          testSign2.sign(pkcs1Key, 'base64');
          return pkcs1Key;
        } catch (error2) {
          throw new Error(`私钥格式无效：无法识别的密钥格式。错误信息：${error2.message}`);
        }
      }
    }
  }

  /* 格式化公钥 */
  private static formatPublicKey(key: string): string {
    if (!key) return '';

    // 如果已经包含头尾，直接返回
    if (key.includes('BEGIN PUBLIC KEY') || key.includes('BEGIN RSA PUBLIC KEY')) {
      return key;
    }

    // 移除所有空格和换行
    const cleanKey = key.replace(/[\r\n\s]/g, '');

    // 每64个字符插入换行
    const formatted = cleanKey.match(/.{1,64}/g)?.join('\n') || '';

    return `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
  }

  /* 构建通用易支付请求参数 */
  static buildParams(
    params: {
      pid: string;
      type: string;
      out_trade_no: string;
      name: string;
      money: string | number;
      clientip: string;
      device: string;
      notify_url: string;
      return_url: string;
      param?: string;
    },
    key: string,
    signType: 'MD5' | 'RSA' = 'MD5',
  ) {
    const signParams: typeof params & { sign?: string; sign_type?: string } = { ...params };

    if (signType === 'RSA') {
      signParams['sign'] = this.signRSA(signParams, key);
      signParams['sign_type'] = 'RSA';
    } else {
      signParams['sign'] = this.signMD5(signParams, key);
      signParams['sign_type'] = 'MD5';
    }

    return signParams;
  }

  /* 构建易支付V2版本请求参数（RSA签名） */
  static buildV2Params(
    params: {
      pid: string;
      method?: string; // 接口类型，如web、jump、jsapi等
      type: string;
      out_trade_no: string;
      name: string;
      money: string | number;
      clientip: string;
      device: string;
      notify_url: string;
      return_url?: string;
      timestamp?: number;
      version?: string;
    },
    privateKey: string,
  ) {
    // 确保金额为保留两位小数的字符串
    const money = typeof params.money === 'number' ? params.money.toFixed(2) : params.money;

    // 构建签名参数，注意参数顺序和类型
    const signParams: any = {
      pid: params.pid,
      method: params.method || 'web',
      device: params.device || 'pc',
      type: params.type,
      out_trade_no: params.out_trade_no,
      notify_url: params.notify_url,
      return_url: params.return_url,
      name: params.name,
      money: money,
      clientip: params.clientip,
      timestamp: (params.timestamp || Math.floor(Date.now() / 1000)).toString(),
      version: params.version || '2.0',
    };

    // 移除可能的undefined值
    Object.keys(signParams).forEach(key => {
      if (signParams[key] === undefined || signParams[key] === null || signParams[key] === '') {
        delete signParams[key];
      }
    });

    try {
      // 计算签名
      const sign = this.signRSA(signParams, privateKey);

      // 添加签名和签名类型
      const finalParams = {
        ...signParams,
        sign: sign,
        sign_type: 'RSA', // V2版本签名类型为RSA
      };

      return finalParams;
    } catch (error) {
      Logger.error('构建易支付V2参数失败', getErrorStack(error), 'EpayPaymentHelper');
      throw error;
    }
  }

  /* 自动识别并构建请求参数（根据配置判断使用哪种方式） */
  static autoBuildParams(
    baseParams: {
      pid: string;
      type: string;
      out_trade_no: string;
      name: string;
      money: string | number;
      clientip: string;
      device: string;
      notify_url: string;
      return_url: string;
      param?: string;
    },
    config: {
      key?: string;
      apiVersion?: string; // v1 或 v2
      privateKey?: string; // V2版本使用
    },
  ) {
    // 版本与配置检查、查询、回调共用同一个解析：无效版本、v2 缺私钥都不降级到 MD5
    const apiVersion = resolveEpayApiVersion(config.apiVersion);
    if (apiVersion === null) {
      throw new Error('易支付接口版本无效，请在支付参数里选择 v1 或 v2');
    }
    if (apiVersion === 'v2') {
      if (!config.privateKey) {
        throw new Error('易支付 v2 需要配置商户私钥');
      }
      // 使用易支付V2版本（RSA签名）
      return this.buildV2Params(
        {
          ...baseParams,
          method: 'web', // V2需要method参数
        },
        config.privateKey,
      );
    }

    // 默认使用标准易支付V1（MD5签名）
    if (!config.key) {
      throw new Error('易支付V1版本需要配置key参数');
    }
    return this.buildParams(baseParams, config.key, 'MD5');
  }

  /* 处理支付响应 */
  static processResponse(
    data: any,
    payType: string,
    config?: { apiVersion?: string },
  ): EpayProcessedResponse {
    const apiVersion = config?.apiVersion || 'v1';

    // V2版本返回格式不同
    if (apiVersion === 'v2') {
      if (data.code !== 0 && data.code !== '0') {
        throw new Error(data.msg || '支付请求失败');
      }

      // V2版本根据pay_type判断返回类型
      const payInfo = data.pay_info;
      const payTypeValue = data.pay_type;

      switch (payTypeValue) {
        case 'jump':
        case 'html':
          return {
            url_qrcode: null,
            redirectUrl: payInfo,
            channel: payType,
            isRedirect: true,
          };
        case 'qrcode':
          return {
            url_qrcode: payInfo,
            redirectUrl: null,
            channel: payType,
            isRedirect: false,
          };
        case 'urlscheme':
          return {
            url_qrcode: null,
            redirectUrl: payInfo,
            channel: payType,
            isRedirect: true,
            isWxMiniProgram: true,
          };
        default:
          // 其他类型暂时按跳转处理
          return {
            url_qrcode: null,
            redirectUrl: payInfo,
            channel: payType,
            isRedirect: true,
          };
      }
    } else {
      // V1版本/标准易支付处理逻辑
      if (data.code != 1) {
        throw new Error(data.msg || '支付请求失败');
      }

      // 根据文档，API返回 payurl、qrcode、urlscheme 三个参数只会返回其中一个
      if (data.payurl) {
        return {
          url_qrcode: null,
          redirectUrl: data.payurl,
          channel: payType,
          isRedirect: true,
        };
      } else if (data.qrcode) {
        return {
          url_qrcode: data.qrcode,
          redirectUrl: null,
          channel: payType,
          isRedirect: false,
        };
      } else if (data.urlscheme) {
        return {
          url_qrcode: null,
          redirectUrl: data.urlscheme,
          channel: payType,
          isRedirect: true,
          isWxMiniProgram: true,
        };
      } else {
        throw new Error('支付接口未返回有效的支付信息');
      }
    }
  }

  /**
   * 验证回调签名：签名方式按配置的版本锁定，不看回调自带的 sign_type 选算法。
   * - v2：只接受 sign_type=RSA，且必须配置了平台公钥（缺公钥直接拒绝，绝不退回 MD5）；
   * - v1（含未设置）：只接受 MD5 或缺省的 sign_type，且商户密钥非空（空密钥能算出与服务端一致的 MD5）；
   * - 无效版本：一律拒绝
   */
  static verifyCallback(
    params: any,
    config: {
      key?: string;
      publicKey?: string;
      apiVersion?: string;
    },
  ): boolean {
    const apiVersion = resolveEpayApiVersion(config.apiVersion);
    if (apiVersion === null) return false;
    const sign = params['sign'];
    if (typeof sign !== 'string' || !sign) return false;
    const signType = params['sign_type'];

    // 复制参数并移除签名字段
    const verifyParams = { ...params };
    delete verifyParams['sign'];
    delete verifyParams['sign_type'];

    if (apiVersion === 'v2') {
      if (signType !== 'RSA' || !config.publicKey) return false;
      return this.verifyRSA(verifyParams, sign, config.publicKey);
    }
    if (signType !== undefined && signType !== '' && signType !== 'MD5') return false;
    if (!config.key) return false;
    return this.signMD5(verifyParams, config.key) === sign;
  }
}
