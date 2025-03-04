"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskCrami = void 0;
function maskCrami(str) {
    if (str.length !== 16) {
        throw new Error('Invalid input');
    }
    const masked = str.substring(0, 6) + '****' + str.substring(10);
    return masked;
}
exports.maskCrami = maskCrami;
