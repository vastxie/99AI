import { BadRequestException, Injectable } from '@nestjs/common';
import { mimeTypeToFormat } from '@/common/utils';
import { resolveFileRef } from '../fileAsset/file-refs';
import { FileAssetService } from '../fileAsset/fileAsset.service';
import { FileMaterializerService } from '../fileAsset/materializer/file-materializer.service';
import { ModelGatewayRequest } from './model-gateway.types';

type InternalMediaKind = 'image' | 'document' | 'audio' | 'video';

interface InternalFilePartDescriptor {
  kind: InternalMediaKind;
  fileRef: string;
  name?: string;
  mime?: string;
}

const INLINE_FILE_MAX_BYTES = 20 * 1024 * 1024;
const PDF_MIME = 'application/pdf';
const PDF_MAGIC = Buffer.from('%PDF-');

@Injectable()
export class ModelGatewayMediaPreparerService {
  constructor(
    private readonly fileAssetService: FileAssetService,
    private readonly fileMaterializerService: FileMaterializerService,
  ) {}

  async prepare(request: ModelGatewayRequest): Promise<ModelGatewayRequest> {
    if (!request.messages?.length) return request;

    let changed = false;
    const messages: ModelGatewayRequest['messages'] = [];
    const budget = { remaining: INLINE_FILE_MAX_BYTES, count: 0 };
    for (const message of request.messages) {
      if (!Array.isArray(message.content)) {
        messages.push(message);
        continue;
      }
      const content: any[] = [];
      for (const part of message.content) {
        let mapped = part;
        if (message.role === 'tool' && this.getInternalMediaKind(part?.type)) {
          try {
            const kind = this.getInternalMediaKind(part.type);
            const capabilities = request.config.capabilities;
            const protocolRejectsAudio =
              kind === 'audio' &&
              ['anthropic_messages', 'openai_responses'].includes(request.config.protocol);
            const supported =
              kind === 'image'
                ? capabilities?.vision
                : kind === 'audio'
                  ? capabilities?.audioInput
                  : false;
            if (!supported || protocolRejectsAudio || budget.count >= 8 || budget.remaining <= 0)
              throw new Error('工具媒体不受支持或超过预算');
            budget.count += 1;
            mapped = await this.materializeInternalFilePart(part, request, budget.remaining, true);
            const data = mapped.image_url?.url || mapped.input_audio?.data || '';
            const bytes = Buffer.byteLength(data.replace(/^data:[^,]+,/, ''), 'base64');
            if (bytes > budget.remaining) throw new Error('工具媒体超过预算');
            budget.remaining -= bytes;
          } catch {
            mapped = {
              type: 'text',
              text: '该工具媒体未提供给模型：模型不支持、文件不可访问或超过本次媒体预算。',
            };
          }
        } else {
          mapped = await this.materializeInternalFilePart(part, request);
        }
        if (mapped !== part) changed = true;
        content.push(mapped);
      }
      messages.push({ ...message, content });
    }

    return changed ? { ...request, messages } : request;
  }

  private async materializeInternalFilePart(
    part: any,
    request: ModelGatewayRequest,
    maxBytes = INLINE_FILE_MAX_BYTES,
    toolMedia = false,
  ): Promise<any> {
    const descriptor = this.getInternalFilePartDescriptor(part);
    if (!descriptor) return part;

    const fileContext = request.fileContext;
    if (!fileContext?.actor || !fileContext.fileRefMapping) {
      throw new BadRequestException('模型多模态文件缺少内部 fileRef 上下文');
    }

    const resolved = await resolveFileRef(this.fileAssetService, {
      fileRef: descriptor.fileRef,
      mapping: fileContext.fileRefMapping,
      actor: fileContext.actor,
    });

    if (descriptor.kind === 'image') {
      const materialized = await this.fileMaterializerService.materializeImageForModel({
        source: resolved.fileId,
        actor: fileContext.actor,
        maxBytes,
      });
      return {
        type: 'image_url',
        image_url: { url: materialized.dataUrl },
      };
    }

    const materialized = await this.fileMaterializerService.materializeFileForService({
      source: resolved.fileId,
      actor: fileContext.actor,
      maxBytes,
    });
    const mime = this.normalizeMime(
      materialized.mime || descriptor.mime || 'application/octet-stream',
    );
    const base64 = materialized.buffer.toString('base64');

    if (descriptor.kind === 'document') {
      this.assertPdfDocument(materialized.buffer);
      return {
        type: 'document',
        document: {
          data: `data:${PDF_MIME};base64,${base64}`,
          mime: PDF_MIME,
          name: descriptor.name || materialized.name,
        },
      };
    }

    if (descriptor.kind === 'audio') {
      if (toolMedia && !['audio/wav', 'audio/mpeg'].includes(mime))
        throw new BadRequestException('模型工具音频输入仅支持 WAV / MP3。');
      return {
        type: 'input_audio',
        input_audio: {
          data: base64,
          format: mimeTypeToFormat(mime),
          mime,
        },
      };
    }

    return {
      type: 'video_url',
      video_url: {
        url: `data:${mime};base64,${base64}`,
      },
    };
  }

  private getInternalFilePartDescriptor(part: any): InternalFilePartDescriptor | null {
    if (!part || typeof part !== 'object') return null;

    const kind = this.getInternalMediaKind(part.type);
    if (!kind) return null;

    const file = part.file && typeof part.file === 'object' ? part.file : part;
    const fileRef = typeof file.fileRef === 'string' ? file.fileRef.trim() : '';
    if (!fileRef) {
      throw new BadRequestException('模型多模态文件缺少 fileRef');
    }

    return {
      kind,
      fileRef,
      name: typeof file.name === 'string' ? file.name : undefined,
      mime: typeof file.mime === 'string' ? file.mime : undefined,
    };
  }

  private getInternalMediaKind(type: unknown): InternalMediaKind | null {
    if (type === 'image_file') return 'image';
    if (type === 'document_file') return 'document';
    if (type === 'audio_file') return 'audio';
    if (type === 'video_file') return 'video';
    return null;
  }

  private assertPdfDocument(buffer: Buffer): void {
    if (!this.isPdfBuffer(buffer)) {
      throw new BadRequestException('当前模型仅支持 PDF 文件直读，其他文件请使用文件分析。');
    }
  }

  private isPdfBuffer(buffer: Buffer): boolean {
    return buffer.subarray(0, 1024).includes(PDF_MAGIC);
  }

  private normalizeMime(mime: string): string {
    return mime.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
  }
}
