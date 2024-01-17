"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiErrorCodeMessage = exports.ErrorMessageEnum = void 0;
var ErrorMessageEnum;
(function (ErrorMessageEnum) {
    ErrorMessageEnum["USERNAME_OR_EMAIL_ALREADY_REGISTERED"] = "\u7528\u6237\u540D\u6216\u90AE\u7BB1\u5DF2\u6CE8\u518C\uFF01";
    ErrorMessageEnum["USER_NOT_FOUND"] = "\u7528\u6237\u4E0D\u5B58\u5728\uFF01";
    ErrorMessageEnum["VERIFICATION_NOT_FOUND"] = "\u9A8C\u8BC1\u8BB0\u5F55\u4E0D\u5B58\u5728\uFF01";
    ErrorMessageEnum["VERIFICATION_CODE_EXPIRED"] = "\u9A8C\u8BC1\u7801\u5DF2\u8FC7\u671F\uFF01";
    ErrorMessageEnum["VERIFICATION_CODE_INVALID"] = "\u9A8C\u8BC1\u7801\u65E0\u6548\uFF01";
    ErrorMessageEnum["VERIFICATION_CODE_MISMATCH"] = "\u9A8C\u8BC1\u7801\u4E0D\u5339\u914D\uFF01";
    ErrorMessageEnum["VERIFICATION_CODE_SEND_FAILED"] = "\u9A8C\u8BC1\u7801\u53D1\u9001\u5931\u8D25\uFF01";
    ErrorMessageEnum["VERIFICATION_CODE_SEND_TOO_OFTEN"] = "\u9A8C\u8BC1\u7801\u53D1\u9001\u8FC7\u4E8E\u9891\u7E41\uFF01";
})(ErrorMessageEnum = exports.ErrorMessageEnum || (exports.ErrorMessageEnum = {}));
exports.OpenAiErrorCodeMessage = {
    400: '[Inter Error] 服务端错误[400]',
    401: '[Inter Error] 服务出现错误、请稍后再试一次吧[401]',
    403: '[Inter Error] 服务器拒绝访问，请稍后再试 | Server refused to access, please try again later',
    429: '[Inter Error] 当前key调用频率过高、请重新对话再试一次吧[429]',
    502: '[Inter Error] 错误的网关 |  Bad Gateway[502]',
    503: '[Inter Error] 服务器繁忙，请稍后再试 | Server is busy, please try again later[503]',
    504: '[Inter Error] 网关超时 | Gateway Time-out[504]',
    500: '[Inter Error] 服务器繁忙，请稍后再试 | Internal Server Error[500]',
};
