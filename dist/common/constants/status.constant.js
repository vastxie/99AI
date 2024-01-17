"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelsMapCn = exports.VerificationUseStatusEnum = void 0;
var VerificationUseStatusEnum;
(function (VerificationUseStatusEnum) {
    VerificationUseStatusEnum[VerificationUseStatusEnum["UNUSED"] = 0] = "UNUSED";
    VerificationUseStatusEnum[VerificationUseStatusEnum["USED"] = 1] = "USED";
})(VerificationUseStatusEnum = exports.VerificationUseStatusEnum || (exports.VerificationUseStatusEnum = {}));
exports.ModelsMapCn = {
    1: '系统内置大模型',
    2: '百度千帆大模型',
    3: '清华智谱大模型'
};
