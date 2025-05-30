export function maskIpAddress(ipAddress: string): string {
  if (!ipAddress) return '';
  const ipArray = ipAddress.split('.');
  ipArray[2] = '***';
  return ipArray.join('.');
}
