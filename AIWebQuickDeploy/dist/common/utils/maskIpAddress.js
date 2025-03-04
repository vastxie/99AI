"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskIpAddress = void 0;
function maskIpAddress(ipAddress) {
    if (!ipAddress)
        return '';
    const ipArray = ipAddress.split('.');
    ipArray[2] = '***';
    return ipArray.join('.');
}
exports.maskIpAddress = maskIpAddress;
