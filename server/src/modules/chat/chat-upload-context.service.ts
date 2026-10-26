import { Injectable } from '@nestjs/common';
import {
  FileRefMappingStore,
  type FileRefEntry,
  type FileRefMapping,
  type FileRefType,
  type RegisterFileRefMetadata,
} from '../fileAsset/file-refs/file-ref-mapping';
import { parseUnifiedMessage } from '../chatLog/unified-message.util';
import type { UnifiedMessage } from '../chatLog/types/message.types';

export type UploadMediaType = 'image' | 'video' | 'audio' | 'document' | 'file';

/** 解析当前上传附件，生成模型媒体上下文与 fileRef 映射。 */
@Injectable()
export class ChatUploadContextService {
  private isValidApiToolName(name: unknown): name is string {
    return typeof name === 'string' && /^[a-zA-Z0-9_-]+$/.test(name);
  }

  resolveApiToolName(toolCall: { toolName?: unknown }): string {
    if (!this.isValidApiToolName(toolCall?.toolName)) {
      throw new Error('历史工具调用缺少有效工具名');
    }
    return toolCall.toolName;
  }

  getUploadUrl(item: any): string {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';

    const candidate = item.url || item.previewUrl || item.downloadUrl || item.publicUrl || '';
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();

    const fileId = typeof item.fileId === 'string' ? item.fileId.trim() : '';
    return /^file_[a-zA-Z0-9_-]+$/.test(fileId) ? `/api/files/${fileId}/preview` : '';
  }

  getUploadFileId(item: any): string {
    if (!item || typeof item !== 'object') return '';
    const candidates = [item.fileId, item.id, item.file?.fileId, item.asset?.fileId];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const fileId = candidate.trim();
      if (/^file_[a-zA-Z0-9]{24}$/.test(fileId)) return fileId;
    }
    return '';
  }

  private isInternalFileAssetUrl(url: string): boolean {
    const source = String(url || '').trim();
    if (!source) return false;
    if (/^\/api\/files\/file_[a-zA-Z0-9]{24}\/(?:preview|download)$/.test(source)) return true;
    try {
      const parsed = new URL(source);
      return /^\/api\/files\/file_[a-zA-Z0-9]{24}\/(?:preview|download)$/.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  getUploadName(item: any): string {
    if (item && typeof item !== 'string' && typeof item.name === 'string') {
      return item.name;
    }
    if (item && typeof item !== 'string' && typeof item.fileName === 'string') {
      return item.fileName;
    }
    if (item && typeof item !== 'string' && typeof item.filename === 'string') {
      return item.filename;
    }
    if (item && typeof item !== 'string' && typeof item.title === 'string') {
      return item.title;
    }
    return '';
  }

  normalizeUploadItems(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return [value];
    if (typeof value !== 'string') return [];

    try {
      const parsed = JSON.parse(value);
      return this.normalizeUploadItems(parsed);
    } catch {
      return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  getUploadMediaType(item: any): UploadMediaType {
    if (typeof item !== 'object' || !item) return 'file';

    const type = String(item.type || item.fileType || '').toLowerCase();
    const mime = String(item.mime || item.mimeType || '').toLowerCase();
    const name = String(
      item.name ||
        item.fileName ||
        item.filename ||
        item.title ||
        item.url ||
        item.downloadUrl ||
        '',
    ).toLowerCase();

    if (type === 'image' || type.startsWith('image/') || mime.startsWith('image/')) {
      return 'image';
    }
    if (type === 'video' || type.startsWith('video/') || mime.startsWith('video/')) {
      return 'video';
    }
    if (type === 'audio' || type.startsWith('audio/') || mime.startsWith('audio/')) {
      return 'audio';
    }
    if (
      type === 'pdf' ||
      type === 'application/pdf' ||
      mime === 'application/pdf' ||
      /\.pdf($|\?)/i.test(name)
    ) {
      return 'document';
    }
    if (/\.(png|jpe?g|webp|gif|bmp|avif|tiff?)($|\?)/i.test(name)) return 'image';
    if (/\.(mp4|webm|mov|m4v)($|\?)/i.test(name)) return 'video';
    if (/\.(mp3|wav|m4a|aac|ogg|flac)($|\?)/i.test(name)) return 'audio';
    return 'file';
  }

  private getFileRefTypeFromUploadType(itemType: UploadMediaType): FileRefType {
    if (
      itemType === 'image' ||
      itemType === 'video' ||
      itemType === 'audio' ||
      itemType === 'document'
    ) {
      return itemType;
    }
    return 'file';
  }

  private getUploadMime(item: any): string | undefined {
    if (!item || typeof item !== 'object') return undefined;
    const mime = item.mime || item.mimeType || item.contentType;
    return typeof mime === 'string' && mime.trim() ? mime.trim() : undefined;
  }

  private getUploadSize(item: any): number | undefined {
    if (!item || typeof item !== 'object') return undefined;
    const size = Number(item.size ?? item.sizeBytes);
    return Number.isFinite(size) && size >= 0 ? size : undefined;
  }

  private buildUploadFileRefMetadata(
    item: any,
    itemType: UploadMediaType,
    toolCall?: any,
  ): RegisterFileRefMetadata {
    return {
      refKind: 'attachment',
      origin: 'user_upload',
      name: this.getUploadName(item) || undefined,
      mime: this.getUploadMime(item),
      type: this.getFileRefTypeFromUploadType(itemType),
      size: this.getUploadSize(item),
      role: typeof item?.role === 'string' ? item.role : undefined,
      sourceToolCallId: typeof toolCall?.id === 'string' ? toolCall.id : undefined,
    };
  }

  registerRequestScopedUploadFileRef(
    store: FileRefMappingStore,
    item: any,
    itemType: UploadMediaType,
    storedEntry?: FileRefEntry,
    toolCall?: any,
  ): FileRefEntry | undefined {
    const fileId = storedEntry?.fileId || this.getUploadFileId(item);
    if (!fileId) return undefined;
    const fileRefType = this.getFileRefTypeFromUploadType(itemType);

    return store.registerFile(fileId, {
      ...this.buildUploadFileRefMetadata(item, itemType, toolCall),
      origin: storedEntry?.origin || 'user_upload',
      name: storedEntry?.name || this.getUploadName(item) || undefined,
      mime: storedEntry?.mime || this.getUploadMime(item),
      type: storedEntry?.type === fileRefType ? storedEntry.type : fileRefType,
      size: storedEntry?.size ?? this.getUploadSize(item),
      role: storedEntry?.role || (typeof item?.role === 'string' ? item.role : undefined),
      sourceToolCallId: storedEntry?.sourceToolCallId || toolCall?.id,
      createdAt: storedEntry?.createdAt,
    });
  }

  private appendFileRefMappingsFromMessage(message: any, entries: FileRefEntry[]): void {
    const rounds = Array.isArray(message?.rounds) ? message.rounds : [];
    for (const round of rounds) {
      const toolCalls = Array.isArray(round?.toolCalls) ? round.toolCalls : [];
      for (const toolCall of toolCalls) {
        const mappings = [toolCall?.internal?.fileRefs];
        for (const mapping of mappings) {
          const candidate = mapping as Partial<FileRefMapping> | undefined;
          if (!Array.isArray(candidate?.entries)) continue;
          for (const entry of candidate.entries) {
            if (entry?.fileRef && entry?.fileId) {
              entries.push(entry as FileRefEntry);
            }
          }
        }
      }
    }
  }

  buildFileRefMappingFromMessages(
    messages: unknown[],
    options: { includeUserUploads?: boolean } = {},
  ): FileRefMapping | undefined {
    const includeUserUploads = options.includeUserUploads !== false;
    const entries: FileRefEntry[] = [];
    const seen = new Set<string>();

    for (const message of messages) {
      const messageObj = parseUnifiedMessage(message);
      if (!messageObj) continue;
      if (includeUserUploads) {
        this.enrichUserUploadFileRefMappings(messageObj);
      }
      const collected: FileRefEntry[] = [];
      this.appendFileRefMappingsFromMessage(messageObj, collected);
      for (const entry of collected) {
        if (
          !includeUserUploads &&
          (entry.origin === 'user_upload' || entry.fileRef.startsWith('attachment_'))
        ) {
          continue;
        }
        const key = `${entry.fileRef}:${entry.fileId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push(entry);
      }
    }

    return entries.length ? new FileRefMappingStore({ entries }).snapshot() : undefined;
  }

  mergeFileRefMappings(...mappings: Array<FileRefMapping | undefined>): FileRefMapping | undefined {
    const entries: FileRefEntry[] = [];
    const seenFileRefs = new Set<string>();

    for (const mapping of mappings) {
      for (const entry of mapping?.entries || []) {
        if (seenFileRefs.has(entry.fileRef)) continue;
        seenFileRefs.add(entry.fileRef);
        entries.push(entry);
      }
    }

    return entries.length ? new FileRefMappingStore({ entries }).snapshot() : undefined;
  }

  enrichUserUploadFileRefMappings(message: UnifiedMessage): FileRefMapping | undefined {
    const existingEntries: FileRefEntry[] = [];
    this.appendFileRefMappingsFromMessage(message, existingEntries);
    const store = new FileRefMappingStore(
      existingEntries.length ? { entries: existingEntries } : undefined,
    );
    let hasRegisteredFile = existingEntries.length > 0;

    const rounds = Array.isArray(message?.rounds) ? message.rounds : [];
    for (const round of rounds) {
      const toolCalls = Array.isArray(round?.toolCalls) ? round.toolCalls : [];
      for (const toolCall of toolCalls) {
        if (!(
          toolCall?.name === 'user_upload' || String(toolCall?.id || '').startsWith('user_upload')
        )) {
          continue;
        }

        const output = toolCall.output || {};
        const items = [...this.normalizeUploadItems(output.files)];

        for (const item of items) {
          const fileId = this.getUploadFileId(item);
          if (!fileId) continue;
          const itemType = this.getUploadMediaType(item);
          store.registerFile(fileId, this.buildUploadFileRefMetadata(item, itemType, toolCall));
          hasRegisteredFile = true;
        }

        if (hasRegisteredFile) {
          (toolCall as any).internal = {
            ...((toolCall as any).internal || {}),
            fileRefs: store.snapshot(),
          };
        }
      }
    }

    return hasRegisteredFile ? store.snapshot() : undefined;
  }

  getUploadItemKey(item: any): string {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    return (
      item.fileId ||
      item.url ||
      item.previewUrl ||
      item.downloadUrl ||
      item.publicUrl ||
      item.name ||
      ''
    );
  }

  buildUploadResourceText(
    resources: Array<{
      label: string;
      name?: string;
      url?: string;
      privateFile?: boolean;
      fileRef?: string;
    }>,
    content = '',
  ): string {
    const lines = resources
      .filter(resource => resource.privateFile || (resource.url && !content.includes(resource.url)))
      .map(resource => {
        const nameText = resource.name ? `（${resource.name}）` : '';
        if (resource.privateFile) {
          if (resource.fileRef) {
            return `- ${resource.label}${nameText}：fileRef=${resource.fileRef}`;
          }
          return `- ${resource.label}${nameText}：已作为私有文件读取`;
        }
        return `- ${resource.label}${nameText}：${resource.url}`;
      });

    return lines.length > 0 ? `用户上传资源：\n${lines.join('\n')}` : '';
  }

  appendUploadResourceText(content: string, resourceText: string): string {
    if (!resourceText) return content || '';
    return content ? `${content}\n\n${resourceText}` : resourceText;
  }

  buildUploadItemForModel(
    item: any,
    itemType: UploadMediaType,
    url: string,
    fileRef?: string,
    supports?: {
      image: boolean;
      video: boolean;
      audio: boolean;
      document: boolean;
    },
  ): {
    isFileAssetSource: boolean;
    part?: any;
  } {
    const fileId = this.getUploadFileId(item);
    const isFileAssetSource =
      Boolean(fileRef) || Boolean(fileId) || this.isInternalFileAssetUrl(url);
    const supported = supports || { image: false, video: false, audio: false, document: false };

    if (isFileAssetSource) {
      if (!fileRef) return { isFileAssetSource: true };
      const file = {
        fileRef,
        name: this.getUploadName(item) || undefined,
        mime: this.getUploadMime(item),
      };
      if (itemType === 'image' && supported.image)
        return { isFileAssetSource, part: { type: 'image_file', file } };
      if (itemType === 'video' && supported.video)
        return { isFileAssetSource, part: { type: 'video_file', file } };
      if (itemType === 'audio' && supported.audio)
        return { isFileAssetSource, part: { type: 'audio_file', file } };
      if (itemType === 'document' && supported.document) {
        return { isFileAssetSource, part: { type: 'document_file', file } };
      }
      return { isFileAssetSource };
    }

    if (!url) return { isFileAssetSource };
    if (itemType === 'image' && supported.image) {
      return { isFileAssetSource, part: { type: 'image_url', image_url: { url } } };
    }
    if (itemType === 'video' && supported.video) {
      return { isFileAssetSource, part: { type: 'video_url', video_url: { url } } };
    }
    if (itemType === 'audio' && supported.audio) {
      return { isFileAssetSource, part: { type: 'input_audio', input_audio: { data: url } } };
    }
    return { isFileAssetSource };
  }
}
