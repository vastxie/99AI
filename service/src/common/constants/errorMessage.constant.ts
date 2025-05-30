export enum ErrorMessageEnum {
  USERNAME_OR_EMAIL_ALREADY_REGISTERED = '用户名或邮箱已注册！',
  USER_NOT_FOUND = '用户不存在！',
  VERIFICATION_NOT_FOUND = '验证记录不存在！',
  VERIFICATION_CODE_EXPIRED = '验证码已过期！',
  VERIFICATION_CODE_INVALID = '验证码无效！',
  VERIFICATION_CODE_MISMATCH = '验证码不匹配！',
  VERIFICATION_CODE_SEND_FAILED = '验证码发送失败！',
  VERIFICATION_CODE_SEND_TOO_OFTEN = '验证码发送过于频繁！',
}

export const OpenAiErrorCodeMessage: Record<string, string> = {
  400: '[Inter Error] 服务端错误[400]',
  401: '[Inter Error] 服务出现错误、请稍后再试一次吧[401]',
  403: '[Inter Error] 服务器拒绝访问，请稍后再试 | Server refused to access, please try again later',
  429: '[Inter Error] 当前key调用频率过高、请重新对话再试一次吧[429]',
  502: '[Inter Error] 错误的网关 |  Bad Gateway[502]',
  503: '[Inter Error] 服务器繁忙，请稍后再试 | Server is busy, please try again later[503]',
  504: '[Inter Error] 网关超时 | Gateway Time-out[504]',
  500: '[Inter Error] 服务器繁忙，请稍后再试 | Internal Server Error[500]',
};
