export function createRandomNonceStr(len: number): string {
  const data = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let str = '';
  for (let i = 0; i < len; i++) {
    str += data.charAt(parseInt((Math.random() * data.length).toFixed(0), 10));
  }
  return str;
}
