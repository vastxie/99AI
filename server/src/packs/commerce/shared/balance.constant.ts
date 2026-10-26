/**
 * @description: 账户充值类型
 * @param {type}
 * 1-9: 充值类型
 * 10-11: 消费类型
 */
export const RechargeType = {
  // 充值类型（1-9）
  REG_GIFT: 1, // 注册赠送
  INVITE_GIFT: 2, // 受邀请赠送
  REFER_GIFT: 3, // 邀请人赠送
  PACKAGE_GIFT: 4, // 购买套餐赠送
  ADMIN_GIFT: 5, // 管理员赠送
  SCAN_PAY: 6, // 扫码支付
  REFUND: 7, // 退款（任务失败、服务异常等场景的积分退还）
  SIGN_IN: 8, // 签到奖励
  RECHARGE_BY_ADMIN: 9, // 管理员批量充值

  // 消费类型（10-11）
  CHAT_DEDUCT: 10, // 对话消费（AI Token）
  TOOL_DEDUCT: 11, // 工具调用消费（外部 API）
};
