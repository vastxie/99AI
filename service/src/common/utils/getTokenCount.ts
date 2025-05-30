import { encode } from 'gpt-tokenizer';

export const getTokenCount = async (input: any): Promise<number> => {
  let text = '';

  if (Array.isArray(input)) {
    // 如果输入是数组，处理消息数组
    text = input.reduce((pre: string, cur: any) => {
      if (Array.isArray(cur.content)) {
        const contentText = cur.content
          .filter((item: { type: string }) => item.type === 'text')
          .map((item: { text: any }) => item.text)
          .join(' ');
        return pre + contentText;
      } else {
        return pre + (cur.content || '');
      }
    }, '');
  } else if (typeof input === 'string') {
    // 如果输入是字符串，直接处理
    text = input;
  } else if (input) {
    // 如果输入是其他类型，将其转换为字符串处理
    text = String(input);
  }

  text = text.replace(/<\|endoftext\|>/g, '');
  return encode(text).length;
};
