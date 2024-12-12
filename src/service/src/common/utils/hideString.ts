export function hideString(input: string, str?: string): string {
  const length = input.length;
  const start = input.slice(0, (length - 10) / 2);
  const end = input.slice((length + 10) / 2, length);
  const hidden = '*'.repeat(10);
  if (str) {
    return `**********${str}**********`;
  }
  return `${start}${hidden}${end}`;
}
