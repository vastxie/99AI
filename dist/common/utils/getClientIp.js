"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = void 0;
function getClientIp(request) {
    let ipAddress = '';
    const headerList = [
        'X-Client-IP',
        'X-Real-IP',
        'X-Forwarded-For',
        'CF-Connecting-IP',
        'True-Client-IP',
        'X-Cluster-Client-IP',
        'Proxy-Client-IP',
        'WL-Proxy-Client-IP',
        'HTTP_CLIENT_IP',
        'HTTP_X_FORWARDED_FOR',
    ];
    for (const header of headerList) {
        const value = request.headers[header];
        if (value && typeof value === 'string') {
            const ips = value.split(',');
            ipAddress = ips[0].trim();
            break;
        }
    }
    if (!ipAddress) {
        ipAddress = request.connection.remoteAddress || '';
    }
    if (ipAddress && ipAddress.includes('::')) {
        const isLocal = /^(::1|fe80(:1)?::1(%.*)?)$/i.test(ipAddress);
        if (isLocal) {
            ipAddress = '';
        }
        else if (ipAddress.includes('::ffff:')) {
            ipAddress = ipAddress.split(':').pop() || '';
        }
    }
    if (!ipAddress || !/\d+\.\d+\.\d+\.\d+/.test(ipAddress)) {
        ipAddress = '';
    }
    return ipAddress;
}
exports.getClientIp = getClientIp;
