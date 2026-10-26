import { parseDataUrl, stringifyContent } from '@/common/utils/model-content.util';
import {
  ModelGatewayMessage,
  ModelGatewayRequest,
} from '@/modules/modelGateway/model-gateway.types';

export interface ResponsesMappedInput {
  instructions?: string;
  input: any[];
}

export function mapGatewayMessagesToResponsesInput(
  messages: ModelGatewayMessage[],
): ResponsesMappedInput {
  const instructions: string[] = [];
  const input: any[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const content = stringifyContent(message.content);
      if (content) instructions.push(content);
      continue;
    }

    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output: Array.isArray(message.content)
          ? mapContent(
              message.content.map(part =>
                part?.type === 'input_audio'
                  ? { type: 'text', text: '此协议不支持工具音频输入。' }
                  : part,
              ),
              'user',
            )
          : stringifyContent(message.content),
      });
      continue;
    }

    const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;

    if (hasToolCalls) {
      const mappedContent = mapContent(message.content, message.role);
      if (hasMappedContent(mappedContent)) {
        input.push({
          role: message.role,
          content: mappedContent,
        });
      }

      // hasToolCalls 已保证 tool_calls 为非空数组
      for (const toolCall of message.tool_calls!) {
        input.push({
          type: 'function_call',
          call_id: toolCall.id,
          name: toolCall.function?.name,
          arguments: toolCall.function?.arguments || '',
        });
      }
      continue;
    }

    input.push({
      role: message.role,
      content: mapContent(message.content, message.role),
    });
  }

  return {
    instructions: instructions.length ? instructions.join('\n\n') : undefined,
    input,
  };
}

export function mapOpenAIChatToolsToResponsesTools(tools?: ModelGatewayRequest['tools']): any[] {
  if (!tools?.length) return [];
  return tools.map(tool => {
    if (tool?.type !== 'function' || !tool.function?.name) {
      throw new Error('OpenAI Responses 仅支持 function tools，不支持内置 tools');
    }
    return {
      type: 'function',
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters || {},
      strict: tool.function.strict ?? null,
    };
  });
}

function hasMappedContent(content: unknown): boolean {
  if (typeof content === 'string') return content.trim().length > 0;
  if (Array.isArray(content)) return content.length > 0;
  return content !== null && content !== undefined;
}

function mapContent(content: ModelGatewayMessage['content'], role: ModelGatewayMessage['role']) {
  if (typeof content === 'string') return content;
  if (content === null || content === undefined) return '';
  if (!Array.isArray(content)) return String(content);

  return content.map(part => {
    if (part?.type === 'text') {
      return { type: 'input_text', text: String(part.text || '') };
    }
    if (part?.type === 'image_url') {
      return {
        type: 'input_image',
        image_url: part.image_url?.url,
        detail: part.image_url?.detail,
      };
    }
    if (part?.type === 'video_url') {
      return {
        type: 'input_video',
        video_url: part.video_url?.url,
      };
    }
    if (part?.type === 'document') {
      return mapDocumentToInputFile(part.document || part);
    }
    if (part?.type === 'input_audio') {
      return mapInputAudio(part.input_audio);
    }
    if (part?.type === 'input_image') {
      return part;
    }
    if (role === 'assistant' && part?.type === 'output_text') {
      return part;
    }
    throw new Error(`OpenAI Responses 暂不支持的 content part: ${part?.type || 'unknown'}`);
  });
}

function mapDocumentToInputFile(document: any): any {
  const fileData = getRequiredDataUrl(
    document?.data || document?.dataUrl,
    '文件输入缺少 base64 数据',
    document?.mime || 'application/pdf',
  );
  assertPdfFileData(fileData);
  const filename = document?.name || document?.filename;

  return {
    type: 'input_file',
    ...(filename ? { filename } : {}),
    file_data: fileData,
  };
}

function assertPdfFileData(dataUrl: string): void {
  const parsed = parseDataUrl(dataUrl);
  if (parsed?.mime !== 'application/pdf') {
    throw new Error('OpenAI Responses 文件输入仅支持 PDF');
  }
}

function mapInputAudio(inputAudio: any): any {
  const dataSource = inputAudio?.data || inputAudio?.dataUrl;
  const parsedDataUrl = parseDataUrl(dataSource);
  const data = getRequiredBase64Payload(dataSource, '音频输入缺少 base64 数据');
  const format = inputAudio?.format || formatFromMime(inputAudio?.mime || parsedDataUrl?.mime);
  if (!format) {
    throw new Error('OpenAI Responses 音频输入缺少 format');
  }

  return {
    type: 'input_audio',
    audio_url: parsedDataUrl?.dataUrl || `data:${mimeFromAudioFormat(format)};base64,${data}`,
  };
}

function getRequiredDataUrl(value: unknown, missingMessage: string, fallbackMime: string): string {
  if (typeof value !== 'string') {
    throw new Error(`OpenAI Responses ${missingMessage}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`OpenAI Responses ${missingMessage}`);
  }
  const parsed = parseDataUrl(trimmed);
  if (parsed) return parsed.dataUrl;
  if (isBase64Payload(trimmed)) return `data:${fallbackMime};base64,${trimmed}`;
  throw new Error('OpenAI Responses 多模态输入仅支持 base64 或 dataUrl');
}

function getRequiredBase64Payload(value: unknown, missingMessage: string): string {
  if (typeof value !== 'string') {
    throw new Error(`OpenAI Responses ${missingMessage}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`OpenAI Responses ${missingMessage}`);
  }
  const parsed = parseDataUrl(trimmed);
  if (parsed) return parsed.base64;
  if (isBase64Payload(trimmed)) return trimmed;
  throw new Error('OpenAI Responses 多模态输入仅支持 base64 或 dataUrl');
}

function isBase64Payload(value: string): boolean {
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function formatFromMime(mime: unknown): string | undefined {
  if (typeof mime !== 'string') return undefined;
  const normalized = mime.toLowerCase();
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('wav') || normalized.includes('wave')) return 'wav';
  return undefined;
}

function mimeFromAudioFormat(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === 'mp3') return 'audio/mpeg';
  if (normalized === 'wav') return 'audio/wav';
  return `audio/${normalized}`;
}
