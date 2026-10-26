import { defineOptions } from '@/utils/options';

/** 商业包在管理端用到的枚举 / 选项（账户明细、套餐、订单） */

// 充值类型（1-9）
const rechargeTypes = defineOptions([
  { value: 1, label: '注册赠送' },
  { value: 2, label: '受邀请赠送' },
  { value: 3, label: '邀请人赠送' },
  { value: 4, label: '购买套餐赠送' },
  { value: 5, label: '管理员调整' },
  { value: 6, label: '扫码支付' },
  { value: 7, label: '退款' },
  { value: 8, label: '签到奖励' },
  { value: 9, label: '管理员批量充值' },
]);

// 消费类型（服务端只写 10 与 11；其他未知类型显示为「其他」）
const consumptionTypes = defineOptions([
  { value: 10, label: '普通对话' },
  { value: 11, label: '工具调用' },
]);

// 充值类型数组（1-9）
export const RECHARGE_TYPE_OPTIONS = rechargeTypes.options;

// 消费类型数组（10、11）
export const CONSUMPTION_TYPE_OPTIONS = consumptionTypes.options;

// 所有类型数组（充值+消费）
export const ALL_ACCOUNT_TYPE_OPTIONS = [...RECHARGE_TYPE_OPTIONS, ...CONSUMPTION_TYPE_OPTIONS];

// 类型 map：1-9 充值类型，10、11 消费类型
export const RECHARGE_TYPE_MAP = { ...rechargeTypes.map, ...consumptionTypes.map };

// 是否开启额外赠送
export const IS_OPTIONS = {
  0: '关闭',
  1: '开启',
};

export const PACKAGE_TYPE_OPTIONS = [
  { value: 0, label: '禁用' },
  { value: 1, label: '启用' },
];

// 支付状态  status 0：未支付、1：已支付、2、支付失败、3：支付超时
const payStatus = defineOptions([
  { value: 0, label: '未支付' },
  { value: 1, label: '已支付' },
  { value: 2, label: '支付失败' },
  { value: 3, label: '支付超时' },
]);
export const PAY_STATUS_OPTIONS = payStatus.options;
// 保留索引签名类型：列表页用 any 类型的行数据直接取值
export const PAY_STATUS_MAP: Record<number, string> = payStatus.map;

// 支付平台 - 支持所有支付渠道，与后端 PaymentChannel 枚举对应
export const { options: PAY_PLATFORM_LIST, map: PAY_PLATFORM_MAP } = defineOptions([
  // 第三方聚合支付
  { value: 'epay', label: '易支付' },
  // 官方支付
  { value: 'wechat_official', label: '微信官方' },
  { value: 'alipay_official', label: '支付宝官方' },
  { value: 'paypal_official', label: 'PayPal官方' },
  { value: 'stripe_official', label: 'Stripe官方' },
]);
