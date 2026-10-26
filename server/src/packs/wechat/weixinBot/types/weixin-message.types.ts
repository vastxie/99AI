/** 微信 iLink Bot 消息格式 */
export interface WeixinMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  create_time_ms?: number;
  session_id?: string;
  message_type?: number; // 1=USER, 2=BOT
  message_state?: number; // 0=NEW, 1=GENERATING, 2=FINISH
  item_list?: WeixinMessageItem[];
  context_token?: string;
}

/** 微信消息内容项 */
export interface WeixinMessageItem {
  type?: number; // 1=TEXT, 2=IMAGE, 3=VOICE, 4=FILE, 5=VIDEO
  text_item?: { text: string };
  image_item?: WeixinImageItem;
  voice_item?: WeixinVoiceItem;
  file_item?: WeixinFileItem;
  video_item?: WeixinVideoItem;
  ref_msg?: WeixinRefMessage;
}

export interface WeixinImageItem {
  /** CDN 媒体引用（API 实际返回字段名为 media） */
  media?: WeixinCDNMedia;
  width?: number;
  height?: number;
}

export interface WeixinVoiceItem {
  media?: WeixinCDNMedia;
  voice_length?: number;
  voice_format?: string;
}

export interface WeixinFileItem {
  media?: WeixinCDNMedia;
  file_name?: string;
  file_size?: number;
}

export interface WeixinVideoItem {
  media?: WeixinCDNMedia;
  thumb_media?: WeixinCDNMedia;
  video_length?: number;
  width?: number;
  height?: number;
}

export interface WeixinCDNMedia {
  encrypt_query_param?: string;
  aes_key?: string;
  /** 加密类型: 0=只加密fileid, 1=打包缩略图/中图等信息 */
  encrypt_type?: number;
  /** 完整下载 URL（服务端直接返回，无需客户端拼接） */
  full_url?: string;
}

export interface WeixinRefMessage {
  ref_msg_id?: number;
  ref_message?: WeixinMessage;
}

/** 二维码绑定会话状态 */
export type BindSessionStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'failed';

/** 绑定会话（缓存在 Redis 中） */
export interface BindSession {
  status: BindSessionStatus;
  userId: number;
  qrData?: string;
  /** 原始二维码数据，轮询 get_qrcode_status 时需要传给 API */
  qrcode?: string;
  botToken?: string;
  baseUrl?: string;
  weixinUserId?: string;
  createdAt: number;
}

/** 微信 Bot 绑定状态（返回给前端） */
export interface WeixinBindStatus {
  bound: boolean;
  status: number; // 0=未绑定, 1=正常, 2=会话过期, 3=异常
  boundAt?: Date;
  weixinUserId?: string;
}
