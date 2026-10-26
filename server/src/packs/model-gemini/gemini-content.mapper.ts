import {
  parseDataUrl,
  parseImageDataUrl,
  parseToolArguments,
  stringifyContent,
} from '@/common/utils/model-content.util';
import { projectToolMediaAsUserContent } from '@/modules/modelGateway/tool-media-message-projection';
import {
  ModelGatewayMessage,
  ModelGatewayRequest,
} from '@/modules/modelGateway/model-gateway.types';
import {
  GEMINI_SKIP_THOUGHT_SIGNATURE,
  isGeminiProviderState,
  isSignatureValidatingGeminiModel,
  rebuildGeminiParts,
} from './gemini-provider-state';

export interface GeminiMappedContent {
  systemInstruction?: { parts: any[] };
  contents: Array<{ role: 'user' | 'model'; parts: any[] }>;
}

export function mapGatewayMessagesToGeminiContent(
  messages: ModelGatewayMessage[],
  options: { model?: string } = {},
): GeminiMappedContent {
  const systemParts: any[] = [];
  const contents: GeminiMappedContent['contents'] = [];
  const toolCallNames = new Map<string, string>();

  for (const message of projectToolMediaAsUserContent(messages)) {
    if (message.role === 'system') {
      const text = stringifyContent(message.content);
      if (text) systemParts.push({ text });
      continue;
    }

    if (message.role === 'tool') {
      const name =
        (message.tool_call_id ? toolCallNames.get(message.tool_call_id) : undefined) ||
        message.name ||
        message.tool_call_id ||
        'tool_result';
      const part = {
        functionResponse: { name, response: { content: stringifyContent(message.content) } },
      };
      const previous = contents.at(-1);
      if (previous?.role === 'user' && previous.parts.every(item => item.functionResponse))
        previous.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
      continue;
    }

    const state =
      message.role === 'assistant' && options.model
        ? isGeminiProviderState(message.provider_state, options.model)
          ? message.provider_state
          : undefined
        : undefined;
    const replayed = state ? rebuildGeminiParts(state, message) : undefined;
    const parts = replayed || mapContentParts(message.content);

    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      let callIndex = 0;
      for (const toolCall of message.tool_calls) {
        const name = toolCall.function?.name;
        if (!name) continue;
        if (toolCall.id) toolCallNames.set(toolCall.id, name);
        const index = callIndex;
        callIndex += 1;
        if (replayed) continue;
        // 状态记录了这个调用原本带签名、但不能按记录回放：gemini-3 会校验，补文档给出的占位值
        const placeholder =
          state &&
          state.signedCalls.includes(index) &&
          isSignatureValidatingGeminiModel(options.model || '');
        parts.push({
          functionCall: {
            name,
            args: parseToolArguments(toolCall.function?.arguments),
          },
          ...(placeholder ? { thoughtSignature: GEMINI_SKIP_THOUGHT_SIGNATURE } : {}),
        });
      }
    }

    if (!parts.length) continue;
    const previous = contents.at(-1);
    if (
      message.role === 'user' &&
      previous?.role === 'user' &&
      previous.parts.every(part => part.functionResponse)
    ) {
      previous.parts.push(...parts);
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  return {
    systemInstruction: systemParts.length ? { parts: systemParts } : undefined,
    contents,
  };
}

export function mapOpenAIChatToolsToGeminiTools(tools?: ModelGatewayRequest['tools']): any[] {
  if (!tools?.length) return [];
  const functionDeclarations = tools.map(tool => {
    if (tool?.type !== 'function' || !tool.function?.name) {
      throw new Error('Gemini Generate Content 仅支持 OpenAI-style function tools');
    }
    return {
      name: tool.function.name,
      description: tool.function.description,
      parameters: sanitizeGeminiToolSchema(
        tool.function.parameters || { type: 'object', properties: {} },
      ),
    };
  });
  return [{ functionDeclarations }];
}

function sanitizeGeminiToolSchema(schema: unknown, depth = 0): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || depth > 30) return {};

  const source = schema as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const normalizedType = normalizeGeminiSchemaType(source.type);

  if (normalizedType.type) result.type = normalizedType.type;
  if (normalizedType.nullable) result.nullable = true;
  if (typeof source.description === 'string') result.description = source.description;
  if (typeof source.format === 'string') result.format = source.format;
  if (typeof source.title === 'string') result.title = source.title;
  if (Array.isArray(source.enum)) {
    const values = source.enum.filter(isGeminiSchemaLiteral);
    if (values.length) result.enum = values;
  } else if (isGeminiSchemaLiteral(source.const)) {
    result.enum = [source.const];
  }

  for (const key of ['minimum', 'maximum'] as const) {
    if (typeof source[key] === 'number') result[key] = source[key];
  }
  for (const key of ['minItems', 'maxItems'] as const) {
    if (Number.isInteger(source[key]) && (source[key] as number) >= 0) result[key] = source[key];
  }

  if (source.items && typeof source.items === 'object' && !Array.isArray(source.items)) {
    const items = sanitizeGeminiToolSchema(source.items, depth + 1);
    if (Object.keys(items).length) result.items = items;
  }
  if (result.type === 'array' && !result.items) {
    result.items = { type: 'string' };
  }
  if (
    source.properties &&
    typeof source.properties === 'object' &&
    !Array.isArray(source.properties)
  ) {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source.properties)) {
      const propertySchema = sanitizeGeminiToolSchema(value, depth + 1);
      if (Object.keys(propertySchema).length) properties[key] = propertySchema;
    }
    if (Object.keys(properties).length) result.properties = properties;
  }
  if (Array.isArray(source.required)) {
    const required = source.required.filter((key): key is string => typeof key === 'string');
    if (required.length) result.required = required;
  }
  const anyOf = Array.isArray(source.anyOf)
    ? source.anyOf
    : Array.isArray(source.oneOf)
      ? source.oneOf
      : undefined;
  if (anyOf) {
    const mapped = anyOf
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => sanitizeGeminiToolSchema(item, depth + 1))
      .filter(item => Object.keys(item).length);
    if (mapped.length) result.anyOf = mapped;
  }

  return result;
}

function normalizeGeminiSchemaType(type: unknown): { type?: string; nullable?: boolean } {
  if (typeof type === 'string') {
    if (type === 'null') return { nullable: true };
    return isGeminiSchemaType(type) ? { type } : {};
  }
  if (!Array.isArray(type)) return {};

  const values = type.filter((item): item is string => typeof item === 'string');
  const firstType = values.find(value => value !== 'null' && isGeminiSchemaType(value));
  return {
    ...(firstType ? { type: firstType } : {}),
    ...(values.includes('null') ? { nullable: true } : {}),
  };
}

function isGeminiSchemaType(value: string): boolean {
  return ['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(value);
}

function isGeminiSchemaLiteral(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function mapContentParts(content: ModelGatewayMessage['content']): any[] {
  if (typeof content === 'string') {
    return content ? [{ text: content }] : [];
  }
  if (content === null || content === undefined) return [];
  if (!Array.isArray(content)) return [{ text: String(content) }];

  return content.map(part => mapContentPart(part)).filter((part): part is any => Boolean(part));
}

function mapContentPart(part: any): any | null {
  if (part?.type === 'text') {
    return { text: String(part.text || '') };
  }

  if (part?.type === 'image_url') {
    return mapImageDataUrl(part.image_url?.url);
  }

  if (part?.type === 'image') {
    return mapImageDataUrl(part.dataUrl || part.url);
  }

  if (part?.type === 'document') {
    return mapDataUrlToInlineData(part.document?.data || part.document?.dataUrl || part.dataUrl);
  }

  if (part?.type === 'video_url') {
    return mapDataUrlToInlineData(part.video_url?.url);
  }

  if (part?.type === 'input_audio') {
    return mapInputAudioToInlineData(part.input_audio);
  }

  throw new Error(`Gemini Generate Content 暂不支持的 content part: ${part?.type || 'unknown'}`);
}

function mapImageDataUrl(value: unknown): any {
  const parsed = parseImageDataUrl(value);
  if (!parsed) {
    throw new Error('Gemini Generate Content 图片输入仅支持已 materialize 的 image dataUrl');
  }
  return {
    inlineData: {
      mimeType: parsed.mime,
      data: parsed.base64,
    },
  };
}

function mapDataUrlToInlineData(value: unknown): any {
  const parsed = parseDataUrl(value);
  if (!parsed) {
    throw new Error('Gemini Generate Content 多模态输入仅支持已 materialize 的 dataUrl');
  }
  return {
    inlineData: {
      mimeType: parsed.mime,
      data: parsed.base64,
    },
  };
}

function mapInputAudioToInlineData(inputAudio: any): any {
  if (!inputAudio || typeof inputAudio.data !== 'string' || !inputAudio.data.trim()) {
    throw new Error('Gemini Generate Content 音频输入缺少 base64 数据');
  }

  const parsed = parseDataUrl(inputAudio.data);
  if (parsed) {
    return {
      inlineData: {
        mimeType: parsed.mime,
        data: parsed.base64,
      },
    };
  }

  const mime = normalizeAudioMime(inputAudio.mime || inputAudio.format);
  return {
    inlineData: {
      mimeType: mime,
      data: inputAudio.data,
    },
  };
}

function normalizeAudioMime(value: unknown): string {
  const raw = typeof value === 'string' ? value.toLowerCase().trim() : '';
  if (raw.startsWith('audio/')) return raw;
  if (raw === 'wav') return 'audio/wav';
  if (raw === 'mp3' || raw === 'mpeg') return 'audio/mpeg';
  if (raw === 'm4a' || raw === 'mp4') return 'audio/mp4';
  if (raw === 'ogg') return 'audio/ogg';
  if (raw === 'flac') return 'audio/flac';
  return 'audio/wav';
}
