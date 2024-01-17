"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeType = exports.DeductionKey = exports.DeductionType = void 0;
exports.DeductionType = {
    BALANCE: 'BALANCE_TYPE',
    CHAT: 'CHAT_TYPE',
    PAINT: 'PAINT_TYPE',
};
exports.DeductionKey = {
    BALANCE_TYPE: 'balance',
    CHAT_TYPE: 'usesLeft',
    PAINT_TYPE: 'paintCount',
};
exports.RechargeType = {
    REG_GIFT: 1,
    INVITE_GIFT: 2,
    REFER_GIFT: 3,
    PACKAGE_GIFT: 4,
    ADMIN_GIFT: 5,
    SCAN_PAY: 6,
    DRAW_FAIL_REFUND: 7,
    SIGN_IN: 8,
};
