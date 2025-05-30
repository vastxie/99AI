export function maskCrami(str: string): string {
  if (str.length !== 16) {
    throw new Error('Invalid input');
  }

  const masked = str.substring(0, 6) + '****' + str.substring(10);
  return masked;
}
