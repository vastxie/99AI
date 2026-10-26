import { BadRequestException } from '@nestjs/common';

export type FileRefKind = 'attachment' | 'output_image' | 'output_file' | 'previous_file';
export type FileRefOrigin = 'user_upload' | 'tool_output' | 'history' | 'unknown';
export type FileRefType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'file' | 'other';

export interface FileRefEntry {
  fileRef: string;
  fileId: string;
  name?: string;
  mime?: string;
  type?: FileRefType | string;
  size?: number;
  role?: string;
  origin?: FileRefOrigin | string;
  sourceToolCallId?: string;
  roundIndex?: number;
  createdAt?: string;
}

export interface FileRefMapping {
  entries: FileRefEntry[];
  counters: Record<FileRefKind, number>;
}

export interface RegisterFileRefMetadata {
  refKind?: FileRefKind;
  origin?: FileRefOrigin | string;
  name?: string;
  mime?: string;
  type?: FileRefType | string;
  size?: number;
  role?: string;
  sourceToolCallId?: string;
  roundIndex?: number;
  createdAt?: string | Date;
}

const FILE_ID_PATTERN = /^file_[0-9A-Za-z]{8,64}$/;
const FILE_REF_PATTERN = /^(attachment|output_image|output_file|previous_file)_([1-9]\d*)$/;

const EMPTY_COUNTERS: Record<FileRefKind, number> = {
  attachment: 0,
  output_image: 0,
  output_file: 0,
  previous_file: 0,
};
const OPTIONAL_STRING_ENTRY_KEYS = [
  'name',
  'mime',
  'type',
  'role',
  'origin',
  'sourceToolCallId',
  'createdAt',
] as const;
type OptionalStringEntryKey = (typeof OPTIONAL_STRING_ENTRY_KEYS)[number];

export function createEmptyFileRefMapping(): FileRefMapping {
  return {
    entries: [],
    counters: { ...EMPTY_COUNTERS },
  };
}

export function assertValidFileId(fileId: string): void {
  if (typeof fileId !== 'string' || !FILE_ID_PATTERN.test(fileId)) {
    throw new BadRequestException('无效的文件 ID。');
  }
}

export function assertValidFileRef(fileRef: string): void {
  if (typeof fileRef !== 'string' || !FILE_REF_PATTERN.test(fileRef)) {
    throw new BadRequestException('无效的文件引用。');
  }
}

export function normalizeFileRefMapping(input?: Partial<FileRefMapping> | null): FileRefMapping {
  const mapping = createEmptyFileRefMapping();
  const entries = Array.isArray(input?.entries) ? input.entries : [];

  for (const entry of entries) {
    const normalized = normalizeEntry(entry);
    mapping.entries.push(normalized);
    const { kind, index } = parseFileRef(normalized.fileRef);
    mapping.counters[kind] = Math.max(mapping.counters[kind], index);
  }

  const counters = input?.counters;
  if (counters && typeof counters === 'object') {
    for (const kind of Object.keys(EMPTY_COUNTERS) as FileRefKind[]) {
      const value = counters[kind];
      if (Number.isInteger(value) && value >= 0) {
        mapping.counters[kind] = Math.max(mapping.counters[kind], value);
      }
    }
  }

  return mapping;
}

export class FileRefMappingStore {
  private readonly mapping: FileRefMapping;

  constructor(input?: Partial<FileRefMapping> | null) {
    this.mapping = normalizeFileRefMapping(input);
  }

  get entries(): FileRefEntry[] {
    return this.mapping.entries;
  }

  snapshot(): FileRefMapping {
    return {
      entries: this.mapping.entries.map(entry => ({ ...entry })),
      counters: { ...this.mapping.counters },
    };
  }

  findByFileRef(fileRef: string): FileRefEntry | undefined {
    assertValidFileRef(fileRef);
    return this.mapping.entries.find(entry => entry.fileRef === fileRef);
  }

  findByFileId(fileId: string): FileRefEntry | undefined {
    assertValidFileId(fileId);
    return this.mapping.entries.find(entry => entry.fileId === fileId);
  }

  registerFile(fileId: string, metadata: RegisterFileRefMetadata = {}): FileRefEntry {
    assertValidFileId(fileId);

    const existing = this.mapping.entries.find(entry => entry.fileId === fileId);
    if (existing) {
      fillMissingMetadata(existing, metadata);
      return { ...existing };
    }

    const refKind = resolveFileRefKind(metadata);
    const nextIndex = this.mapping.counters[refKind] + 1;
    this.mapping.counters[refKind] = nextIndex;

    const entry = normalizeEntry({
      fileRef: `${refKind}_${nextIndex}`,
      fileId,
      ...metadataToEntry(metadata),
    });
    this.mapping.entries.push(entry);
    return { ...entry };
  }
}

function normalizeEntry(entry: Partial<FileRefEntry>): FileRefEntry {
  const fileRef = normalizeRequiredString(entry.fileRef, '无效的文件引用。', 64);
  const fileId = normalizeRequiredString(entry.fileId, '无效的文件 ID。', 80);
  assertValidFileRef(fileRef);
  assertValidFileId(fileId);

  const normalized: FileRefEntry = { fileRef, fileId };
  assignOptionalString(normalized, 'name', entry.name, 255);
  assignOptionalString(normalized, 'mime', entry.mime, 128);
  assignOptionalString(normalized, 'type', entry.type, 32);
  assignOptionalString(normalized, 'role', entry.role, 64);
  assignOptionalString(normalized, 'origin', entry.origin, 96);
  assignOptionalString(normalized, 'sourceToolCallId', entry.sourceToolCallId, 128);
  assignOptionalString(normalized, 'createdAt', entry.createdAt, 64);

  if (Number.isFinite(entry.size) && Number(entry.size) >= 0) {
    normalized.size = Number(entry.size);
  }
  if (Number.isInteger(entry.roundIndex) && Number(entry.roundIndex) >= 0) {
    normalized.roundIndex = Number(entry.roundIndex);
  }

  return normalized;
}

function metadataToEntry(metadata: RegisterFileRefMetadata): Partial<FileRefEntry> {
  const createdAt =
    metadata.createdAt instanceof Date ? metadata.createdAt.toISOString() : metadata.createdAt;
  return {
    origin: metadata.origin,
    name: metadata.name,
    mime: metadata.mime,
    type: metadata.type,
    size: metadata.size,
    role: metadata.role,
    sourceToolCallId: metadata.sourceToolCallId,
    roundIndex: metadata.roundIndex,
    createdAt,
  };
}

function fillMissingMetadata(entry: FileRefEntry, metadata: RegisterFileRefMetadata): void {
  const next = metadataToEntry(metadata);
  for (const key of OPTIONAL_STRING_ENTRY_KEYS) {
    if (entry[key] === undefined && next[key] !== undefined) {
      entry[key] = next[key];
    }
  }
  if (entry.size === undefined && next.size !== undefined) {
    entry.size = next.size;
  }
  if (entry.roundIndex === undefined && next.roundIndex !== undefined) {
    entry.roundIndex = next.roundIndex;
  }
}

function resolveFileRefKind(metadata: RegisterFileRefMetadata): FileRefKind {
  if (metadata.refKind) return metadata.refKind;
  if (metadata.origin === 'user_upload') return 'attachment';
  if (metadata.origin === 'history') return 'previous_file';
  if (metadata.type === 'image' || (metadata.mime || '').startsWith('image/'))
    return 'output_image';
  return 'output_file';
}

function parseFileRef(fileRef: string): { kind: FileRefKind; index: number } {
  const match = FILE_REF_PATTERN.exec(fileRef);
  if (!match) {
    throw new BadRequestException('无效的文件引用。');
  }
  return {
    kind: match[1] as FileRefKind,
    index: Number(match[2]),
  };
}

function normalizeRequiredString(value: unknown, errorMessage: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(errorMessage);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new BadRequestException(errorMessage);
  }
  return trimmed;
}

function assignOptionalString(
  target: FileRefEntry,
  key: OptionalStringEntryKey,
  value: unknown,
  maxLength: number,
): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  target[key] = trimmed.slice(0, maxLength);
}
