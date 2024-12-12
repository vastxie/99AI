export const ChatType = {
  NORMAL_CHAT: 1, // 普通对话
  PAINT: 2, // 绘图
  EXTENDED_CHAT: 3, // 拓展性对话
};

/**
 * @description: 扣费类型
 * @param {type}
 * 1: 模型3 模型4 MJ  TODO 新版更新已经修改了 TYPE 这里暂不处理
 */
// export const DeductionKey = {
//   BALANCE_TYPE: 'balance',
//   CHAT_TYPE: 'usesLeft',
//   PAINT_TYPE: 'paintCount',
// };

/**
 * @description: 账户充值类型
 * @param {type}
 * 1: 注册赠送  2: 受邀请赠送  3: 邀请人赠送  4: 购买套餐赠送  5: 管理员赠送 6：扫码支付 7: 绘画失败退款 8: 签到奖励
 */
export const RechargeType = {
  REG_GIFT: 1,
  INVITE_GIFT: 2,
  REFER_GIFT: 3,
  PACKAGE_GIFT: 4,
  ADMIN_GIFT: 5,
  SCAN_PAY: 6,
  DRAW_FAIL_REFUND: 7,
  SIGN_IN: 8,
};
