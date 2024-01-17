"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExpired = exports.formatCreateOrUpdateDate = exports.formatDate = void 0;
const dayjs = require("dayjs");
require("dayjs/locale/zh-cn");
const a = require("dayjs/plugin/utc");
const b = require("dayjs/plugin/timezone");
dayjs.locale('zh-cn');
dayjs.extend(a);
dayjs.extend(b);
dayjs.tz.setDefault('Asia/Shanghai');
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs(date).format(format);
}
exports.formatDate = formatDate;
function formatCreateOrUpdateDate(input, format = 'YYYY-MM-DD HH:mm:ss') {
    if (Array.isArray(input)) {
        return input.map((t) => {
            t.createdAt = (t === null || t === void 0 ? void 0 : t.createdAt) ? dayjs(t.createdAt).format(format) : dayjs().format(format);
            t.updatedAt = (t === null || t === void 0 ? void 0 : t.updatedAt) ? dayjs(t.updatedAt).format(format) : dayjs().format(format);
            return t;
        });
    }
    else {
        let obj = {};
        try {
            obj = JSON.parse(JSON.stringify(input));
        }
        catch (error) {
        }
        (obj === null || obj === void 0 ? void 0 : obj.createdAt) && (obj.createdAt = dayjs(obj.createdAt).format(format));
        (obj === null || obj === void 0 ? void 0 : obj.updatedAt) && (obj.updatedAt = dayjs(obj.updatedAt).format(format));
        return obj;
    }
}
exports.formatCreateOrUpdateDate = formatCreateOrUpdateDate;
function isExpired(createdAt, days) {
    const expireDate = new Date(createdAt.getTime() + days * 24 * 60 * 60 * 1000);
    const now = new Date();
    return now > expireDate;
}
exports.isExpired = isExpired;
exports.default = dayjs;
