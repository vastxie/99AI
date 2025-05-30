/**
 * PENDING: 审核中
 * ACTIVE: 正常状态
 * LOCKED: 账号锁定
 * BLACKLISTED: 黑名单账号
 */
export enum UserStatusEnum {
  PENDING,
  ACTIVE,
  LOCKED,
  BLACKLISTED,
}

export const UserStatusErrMsg = {
  [UserStatusEnum.PENDING]: '当前账户未激活,请前往邮箱验证或重新发送验证码！',
  [UserStatusEnum.ACTIVE]: '当前账户已激活！',
  [UserStatusEnum.LOCKED]: '当前账户已锁定,请联系管理员解锁！',
  [UserStatusEnum.BLACKLISTED]: '当前账户已被永久封禁！',
};
