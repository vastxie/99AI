/**
 * 内容过滤端口（内核侧）
 *
 * 内核（对话预检）只依赖这个窄接口，不依赖任何具体实现。
 * 实现以 CONTENT_FILTER_IMPLEMENTATION 令牌注册；ContentFilterModule 在有实现时把它挂到
 * CONTENT_FILTER_PORT，否则使用 PassthroughContentFilter。
 * 命中后由内核统一拒绝。实现可把违规记录与用户计数原子落库，并通过
 * violationCounted 告知内核不要重复累计。
 */
export const CONTENT_FILTER_PORT = 'CONTENT_FILTER_PORT';
/** 由扩展包提供的实现令牌；内核只做可选注入，不引用实现类型。 */
export const CONTENT_FILTER_IMPLEMENTATION = 'CONTENT_FILTER_IMPLEMENTATION';

export interface ContentFilterHit {
  words: string[];
  /** 给用户看的拒绝原因；缺省时由内核给出通用提示 */
  message?: string;
  /** 实现已原子累计 users.violationCount；内核不得再次累计。 */
  violationCounted?: boolean;
}

export interface ContentFilterPort {
  /** 命中时返回命中词；未命中返回 null。持久记录失败时只抛安全的服务异常。 */
  check(input: {
    text: string;
    userId?: number | null;
    /** 同一逻辑预检重试的稳定摘要；不得包含 prompt、身份凭据或原始请求。 */
    idempotencyKey?: string;
  }): Promise<ContentFilterHit | null>;
}

/* 直通实现：永不命中 */
export class PassthroughContentFilter implements ContentFilterPort {
  async check(): Promise<ContentFilterHit | null> {
    return null;
  }
}
