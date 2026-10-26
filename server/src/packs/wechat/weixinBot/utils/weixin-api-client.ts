import { getErrorStack } from '@/common/utils/error-stack.util';
import { randomBytes } from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { Logger } from '@nestjs/common';
import { WeixinMessage } from '../types/weixin-message.types';

/** 默认 bot_type（与腾讯开源源码一致） */
const DEFAULT_BOT_TYPE = '3';
/** 与参考实现一致的 channel_version */
const CHANNEL_VERSION = '2.2.0';

export interface WeixinApiClientOptions {
  botToken: string;
  baseUrl?: string;
}

/**
 * 微信 iLink Bot API 客户端
 * 参考源码: hermes-agent gateway/platforms/weixin.py
 */
export class WeixinApiClient {
  private readonly baseUrl: string;
  private readonly http: AxiosInstance;

  constructor(private readonly options: WeixinApiClientOptions) {
    this.baseUrl = options.baseUrl || 'https://ilinkai.weixin.qq.com';

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  /**
   * 生成随机 X-WECHAT-UIN（每次请求都生成新的，与参考实现一致）
   */
  private randomUin(): string {
    const uint32 = randomBytes(4).readUInt32BE(0);
    return Buffer.from(String(uint32), 'utf-8').toString('base64');
  }

  /**
   * 构建 iLink-App-ClientVersion: uint32 编码 0x00MMNNPP
   * 与参考实现一致: (2 << 16) | (2 << 8) | 0 = 131584
   */
  private buildClientVersion(): number {
    return (2 << 16) | (2 << 8) | 0;
  }

  /**
   * 构建公共请求头（GET 请求用，不含 Authorization）
   */
  private buildCommonHeaders(): Record<string, string> {
    return {
      'iLink-App-Id': 'bot',
      'iLink-App-ClientVersion': String(this.buildClientVersion()),
    };
  }

  /**
   * 构建认证请求头（POST 请求用，含 Authorization）
   * 注意：X-WECHAT-UIN 每次请求都不同（参考实现行为）
   */
  private buildAuthHeaders(body: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body, 'utf-8')),
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': this.randomUin(),
      ...this.buildCommonHeaders(),
    };
    if (this.options.botToken?.trim()) {
      headers.Authorization = `Bearer ${this.options.botToken.trim()}`;
    }
    return headers;
  }

  /** 构建 base_info（每个 POST 请求都需要） */
  private buildBaseInfo(): { channel_version: string } {
    return { channel_version: CHANNEL_VERSION };
  }

  /** 获取登录二维码（GET 请求，不需要 token） */
  async getBotQrCode(): Promise<{ qrcode: string; qrcode_img_content: string }> {
    const url = `${this.baseUrl}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(
      DEFAULT_BOT_TYPE,
    )}`;
    const res = await axios.get(url, {
      headers: this.buildCommonHeaders(),
      timeout: 15000,
    });
    return res.data;
  }

  /**
   * 轮询扫码状态（GET 长轮询，不需要 token）
   */
  async getQrCodeStatus(
    qrcode: string,
    signal?: AbortSignal,
  ): Promise<{
    status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'scaned_but_redirect';
    bot_token?: string;
    ilink_bot_id?: string;
    baseurl?: string;
    ilink_user_id?: string;
    redirect_host?: string;
  }> {
    const url = `${this.baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
    const res = await axios.get(url, {
      headers: this.buildCommonHeaders(),
      timeout: 35000,
      signal,
    });
    return res.data;
  }

  /**
   * 获取新消息（POST 长轮询）
   */
  async getUpdates(
    syncBuf?: string,
    signal?: AbortSignal,
  ): Promise<{
    ret: number;
    msgs: WeixinMessage[];
    get_updates_buf?: string;
  }> {
    const body = JSON.stringify({
      get_updates_buf: syncBuf || '',
      base_info: this.buildBaseInfo(),
    });
    const res = await this.http.post('/ilink/bot/getupdates', body, {
      headers: this.buildAuthHeaders(body),
      timeout: 35000,
      signal,
    });
    return res.data;
  }

  /**
   * 发送消息
   * 请求体结构参考: hermes-agent _send_message()
   * {"msg": {"from_user_id":"","to_user_id":"","client_id":"","message_type":2,"message_state":2,"context_token":"...","item_list":[...]}, "base_info":{"channel_version":"2.2.0"}}
   */
  async sendMessage(msg: {
    to_user_id: string;
    /** 上游消息可能不带 context_token，下方按存在与否写入 */
    context_token?: string;
    item_list: any[];
  }): Promise<void> {
    const messagePayload: Record<string, any> = {
      from_user_id: '',
      to_user_id: msg.to_user_id,
      client_id: this.randomUin(),
      message_type: 2, // MSG_TYPE_BOT
      message_state: 2, // MSG_STATE_FINISH
      item_list: msg.item_list,
    };
    if (msg.context_token) {
      messagePayload.context_token = msg.context_token;
    }
    const body = JSON.stringify({ msg: messagePayload, base_info: this.buildBaseInfo() });
    try {
      const res = await this.http.post('/ilink/bot/sendmessage', body, {
        headers: this.buildAuthHeaders(body),
        timeout: 10000,
      });
      const respData = res.data;
      if (respData?.ret && respData.ret !== 0) {
        Logger.error(`[sendMessage] API错误: ret=${respData.ret}`, 'WeixinApiClient');
      }
    } catch (err: any) {
      Logger.error(`[sendMessage] 请求失败: ${err.message}`, getErrorStack(err), 'WeixinApiClient');
      throw err;
    }
  }

  /**
   * 发送/取消"正在输入"状态
   * 参考实现: sendTyping 需要 typing_ticket（从 getConfig 获取）
   */
  async sendTyping(params: {
    ilink_user_id: string;
    typing_ticket: string;
    status: number;
  }): Promise<void> {
    try {
      const body = JSON.stringify({ ...params, base_info: this.buildBaseInfo() });
      await this.http.post('/ilink/bot/sendtyping', body, {
        headers: this.buildAuthHeaders(body),
        timeout: 5000,
      });
    } catch (err: any) {
      Logger.debug(`发送typing状态失败: ${err.message}`, 'WeixinApiClient');
    }
  }

  /**
   * 获取 CDN 上传预签名 URL
   * 参考: Tencent/openclaw-weixin src/api/api.ts getUploadUrl()
   */
  async getUploadUrl(body: string): Promise<{
    upload_param?: string;
    upload_full_url?: string;
    thumb_upload_param?: string;
  }> {
    const res = await this.http.post('/ilink/bot/getuploadurl', body, {
      headers: this.buildAuthHeaders(body),
      timeout: 15000,
    });
    return res.data;
  }

  /** 获取配置（typing ticket 等） */
  async getConfig(ilinkUserId: string, contextToken?: string): Promise<any> {
    const body = JSON.stringify({
      ilink_user_id: ilinkUserId,
      context_token: contextToken,
      base_info: this.buildBaseInfo(),
    });
    const res = await this.http.post('/ilink/bot/getconfig', body, {
      headers: this.buildAuthHeaders(body),
      timeout: 5000,
    });
    return res.data;
  }
}
