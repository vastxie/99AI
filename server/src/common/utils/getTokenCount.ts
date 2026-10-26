// gpt-tokenizer 3 起默认编码改为 o200k_base；显式固定 cl100k_base，回退 token 估算与计费口径不变
import { encode } from 'gpt-tokenizer/cjs/encoding/cl100k_base';
import { Logger } from '@nestjs/common';

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

  try {
    // 使用 allowedSpecial: 'all' 允许所有特殊 token，避免编码异常
    return encode(text, { allowedSpecial: 'all' }).length;
  } catch (error) {
    // 如果 encode 仍然失败，使用简单的字符估算
    Logger.warn(`[getTokenCount] encode 失败，使用字符估算: ${error.message}`, 'getTokenCount');
    return Math.ceil(text.length / 2);
  }
};
