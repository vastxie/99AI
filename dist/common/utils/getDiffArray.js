"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiffArray = void 0;
function getDiffArray(aLength, bLength, str) {
    const a = Array.from({ length: aLength }, (_, i) => i + 1);
    const b = Array.from({ length: bLength }, (_, i) => i + 1);
    const diffArray = [];
    for (let i = 0; i < a.length; i++) {
        if (!b.includes(a[i])) {
            diffArray.push(`${str}${a[i]}`);
        }
    }
    return diffArray;
}
exports.getDiffArray = getDiffArray;
