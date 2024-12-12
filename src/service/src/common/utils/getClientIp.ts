import { Request } from 'express';

function getFirstValidIp(ipString: string): string {
  const ips = ipString.split(',').map(ip => ip.trim());
  // 可以在这里加入对IP地址有效性的额外验证
  return ips.find(ip => isValidIp(ip)) || '';
}

function isValidIp(ip: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || /^::ffff:\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

export function getClientIp(req: Request): string {
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
