export function generateRandomString(): string {
  const length = 10;
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex: number = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}
