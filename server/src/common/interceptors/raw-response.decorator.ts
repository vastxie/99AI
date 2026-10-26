import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE = 'rawResponse';

/**
 * 标记返回原始报文的处理器（如第三方回调要求按其协议原样应答），
 * TransformInterceptor 对这类处理器不套统一的 Result 包装。
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);
