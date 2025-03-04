"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = void 0;
function getFirstValidIp(ipString) {
    const ips = ipString.split(',').map(ip => ip.trim());
    return ips.find(ip => isValidIp(ip)) || '';
}
function isValidIp(ip) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || /^::ffff:\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}
function getClientIp(req) {
    const forwardedFor = req.header('x-forwarded-for');
    let clientIp = forwardedFor ? getFirstValidIp(forwardedFor) : '';
    if (!clientIp) {
        clientIp = req.connection.remoteAddress || req.socket.remoteAddress || '';
    }
    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7);
    }
    return clientIp;
}
exports.getClientIp = getClientIp;
