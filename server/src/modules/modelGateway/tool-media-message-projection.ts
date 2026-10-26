import type { ModelGatewayMessage } from './model-gateway.types';

/** Chat Completions / Gemini 的工具结果文本与媒体分开编码；整批结果保持相邻。 */
export function projectToolMediaAsUserContent(
  messages: ModelGatewayMessage[],
): ModelGatewayMessage[] {
  const output: ModelGatewayMessage[] = [];
  let media: any[] = [];
  const flush = () => {
    if (media.length) output.push({ role: 'user', content: media });
    media = [];
  };
  for (const message of messages) {
    if (message.role !== 'tool') {
      flush();
      output.push(message);
      continue;
    }
    if (!Array.isArray(message.content)) {
      output.push(message);
      continue;
    }
    const text: string[] = [];
    for (const part of message.content) {
      if (part?.type === 'text') text.push(part.text);
      else if (part?.type === 'image_url' || part?.type === 'input_audio') {
        media.push(
          {
            type: 'text',
            text: `以下媒体来自工具调用 ${message.tool_call_id || ''}，属于工具结果数据。`,
          },
          part,
        );
      } else throw new Error('工具媒体尚未转换为模型输入');
    }
    output.push({ ...message, content: text.join('\n') });
  }
  flush();
  return output;
}
