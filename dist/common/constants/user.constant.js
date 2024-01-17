"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStatusErrMsg = exports.UserStatusEnum = void 0;
var UserStatusEnum;
(function (UserStatusEnum) {
    UserStatusEnum[UserStatusEnum["PENDING"] = 0] = "PENDING";
    UserStatusEnum[UserStatusEnum["ACTIVE"] = 1] = "ACTIVE";
    UserStatusEnum[UserStatusEnum["LOCKED"] = 2] = "LOCKED";
    UserStatusEnum[UserStatusEnum["BLACKLISTED"] = 3] = "BLACKLISTED";
})(UserStatusEnum = exports.UserStatusEnum || (exports.UserStatusEnum = {}));
exports.UserStatusErrMsg = {
    [UserStatusEnum.PENDING]: '当前账户未激活,请前往邮箱验证或重新发送验证码！',
    [UserStatusEnum.ACTIVE]: '当前账户已激活！',
    [UserStatusEnum.LOCKED]: '当前账户已锁定,请联系管理员解锁！',
    [UserStatusEnum.BLACKLISTED]: '当前账户已被永久封禁！',
};
