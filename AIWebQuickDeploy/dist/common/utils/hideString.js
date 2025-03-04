"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hideString = void 0;
function hideString(input, str) {
    const length = input.length;
    const start = input.slice(0, (length - 10) / 2);
    const end = input.slice((length + 10) / 2, length);
    const hidden = '*'.repeat(10);
    if (str) {
        return `**********${str}**********`;
    }
    return `${start}${hidden}${end}`;
}
exports.hideString = hideString;
