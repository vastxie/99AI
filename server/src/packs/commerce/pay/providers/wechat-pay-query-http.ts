import axios from 'axios';

/** 微信支付 SDK 请求实现的输出形状（与 SDK 默认实现一致：成功给 data，失败给 error 文本） */
export interface WechatPayHttpOutput {
  status?: number;
  data?: unknown;
  error?: string;
}

/** 网络错误、超时、中止时给出的固定文本（不含响应内容与地址） */
export const WECHAT_PAY_QUERY_REQUEST_FAILED = '微信支付查单请求失败';

/**
 * 查单专用的请求实现，经 SDK 的 createHttp 只装在每次新建的查单 Pay 实例上（下单、退款仍用 SDK 默认实现）。
 * axios 的 timeout 收到响应头后就不再计时，所以另传 AbortSignal 作为覆盖响应体读取的绝对期限，到期中止整个请求；
 * 响应体按文本取：2xx 解析 JSON 给 data，非 2xx 把原文本给 error（现有解析对 404 的 error 做 JSON.parse）
 */
export class WechatPayQueryHttp {
  constructor(private readonly deadlineMs = 10_000) {}

  async get(url: string, headers: Record<string, any>): Promise<WechatPayHttpOutput> {
    let response: { status: number; data: unknown };
    try {
      response = await axios.get(url, {
        headers,
        timeout: this.deadlineMs,
        signal: AbortSignal.timeout(this.deadlineMs),
        responseType: 'text',
        transformResponse: [(data: unknown) => data],
        validateStatus: () => true,
        maxRedirects: 0,
      });
    } catch {
      return { status: undefined, error: WECHAT_PAY_QUERY_REQUEST_FAILED };
    }
    const text = typeof response.data === 'string' ? response.data : '';
    if (response.status >= 200 && response.status < 300) {
      try {
        return { status: response.status, data: JSON.parse(text) };
      } catch {
        return { status: response.status, error: WECHAT_PAY_QUERY_REQUEST_FAILED };
      }
    }
    return { status: response.status, error: text };
  }

  post(): Promise<WechatPayHttpOutput> {
    return Promise.reject(new Error('查单请求实现只支持 GET'));
  }

  upload(): Promise<WechatPayHttpOutput> {
    return Promise.reject(new Error('查单请求实现只支持 GET'));
  }
}
