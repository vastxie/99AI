/**
 * 支付渠道的品牌标识色（由外部品牌规范决定，不随主题翻转），与 admin 的同名登记表保持一致。
 * chat 当前只有微信支付图标需要着色，其余渠道用自带配色的 logo 图标。
 */
export const COMMERCE_BRAND_COLORS = {
  wechatPay: '#07c160',
  alipay: '#1677ff',
  epay: '#1890ff',
  paypal: '#003087',
  stripe: '#635bff',
} as const
