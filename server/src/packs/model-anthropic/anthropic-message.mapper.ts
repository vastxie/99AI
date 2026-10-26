import {
  parseDataUrl,
  parseImageDataUrl,
  parseToolArguments,
  stringifyContent,
} from '@/common/utils/model-content.util';
import {
  ModelGatewayMessage,
  ModelGatewayRequest,
} from '@/modules/modelGateway/model-gateway.types';

export interface AnthropicMappedMessages {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: any[] }>;
  /** 与 messages 对齐：助手消息对应的平台消息（回放厂商私有状态用），其余为 undefined */
  sources: Array<ModelGatewayMessage | undefined>;
}

export function mapGatewayMessagesToAnthropicMessages(
  messages: ModelGatewayMessage[],
): AnthropicMappedMessages {
  const system: string[] = [];
  const mappedMessages: AnthropicMappedMessages['messages'] = [];
  const sources: AnthropicMappedMessages['sources'] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const content = stringifyContent(message.content);
      if (content) system.push(content);
      continue;
    }

    if (message.role === 'tool') {
      const toolResult = {
        type: 'tool_result',
        tool_use_id: message.tool_call_id,
        content: Array.isArray(message.content)
          ? mapContentBlocks(
              message.content.map(part =>
                part?.type === 'input_audio'
                  ? { type: 'text', text: '此协议不支持工具音频输入。' }
                  : part,
              ),
            )
          : stringifyContent(message.content),
      };
      const previous = mappedMessages.at(-1);
      if (
        previous?.role === 'user' &&
        previous.content.every(part => part.type === 'tool_result')
      ) {
        previous.content.push(toolResult);
      } else {
        mappedMessages.push({
          role: 'user',
          content: [toolResult],
        });
        sources.push(undefined);
      }
      continue;
    }

    const content = mapContentBlocks(message.content);

    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function?.name,
          input: parseToolArguments(toolCall.function?.arguments),
        });
      }
    }

    mappedMessages.push({
      role: message.role,
      content,
    });
    sources.push(message.role === 'assistant' ? message : undefined);
  }

  return {
    system: system.length ? system.join('\n\n') : undefined,
    messages: mappedMessages,
    sources,
  };
}

export function mapOpenAIChatToolsToAnthropicTools(tools?: ModelGatewayRequest['tools']): any[] {
  if (!tools?.length) return [];
  return tools.map(tool => {
    if (tool?.type !== 'function' || !tool.function?.name) {
      throw new Error('Anthropic Messages 仅支持 OpenAI-style function tools');
    }
    return {
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters || { type: 'object', properties: {} },
    };
  });
}

function mapContentBlocks(content: ModelGatewayMessage['content']): any[] {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', text: content }] : [];
  }
  if (content === null || content === undefined) return [];
  if (!Array.isArray(content)) return [{ type: 'text', text: String(content) }];

  return content.map(part => mapContentPart(part)).filter((part): part is any => Boolean(part));
}

function mapContentPart(part: any): any | null {
  if (part?.type === 'text') {
    return { type: 'text', text: String(part.text || '') };
  }

  if (part?.type === 'image_url') {
    return mapImageDataUrl(part.image_url?.url);
  }

  if (part?.type === 'image') {
    return mapImageDataUrl(part.dataUrl || part.url);
  }

  if (part?.type === 'document') {
    return mapPdfDocument(part.document || part);
  }

  throw new Error(`Anthropic Messages 暂不支持的 content part: ${part?.type || 'unknown'}`);
}

function mapImageDataUrl(value: unknown): any {
  const parsed = parseImageDataUrl(value);
  if (!parsed) {
    throw new Error('Anthropic Messages 图片输入仅支持已 materialize 的 image dataUrl');
  }
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: parsed.mime,
      data: parsed.base64,
    },
  };
}

function mapPdfDocument(document: any): any {
  const parsed = parseDataUrl(document?.data || document?.dataUrl || document?.url);
  if (!parsed || parsed.mime !== 'application/pdf') {
    throw new Error('Anthropic Messages 文档输入仅支持已 materialize 的 PDF dataUrl');
  }
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: parsed.mime,
      data: parsed.base64,
    },
  };
}
