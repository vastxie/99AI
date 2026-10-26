import { MODEL_CONTENT_LIMIT, OUTPUT_HINT_TYPES } from './constants';
import { OutputHint, OutputHintType } from './types';

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeOutputHint(value: any): OutputHint | undefined {
  if (!isPlainObject(value)) return undefined;
  const type = String(value.type || '').toLowerCase();
  if (!OUTPUT_HINT_TYPES.has(type)) return undefined;
  const aspectRatio = normalizeAspectRatio(
    value.aspectRatio ?? value.aspect_ratio ?? value.ratio ?? value.size ?? value.resolution,
  );
  return aspectRatio
    ? { type: type as OutputHintType, aspectRatio }
    : { type: type as OutputHintType };
}

function getGreatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function normalizeAspectRatio(value: any): string | undefined {
  if (isPlainObject(value)) {
    const width = Number(value.width ?? value.w);
    const height = Number(value.height ?? value.h);
    return normalizeDimensions(width, height);
  }

  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const raw = String(value).trim().toLowerCase();
  if (!raw || ['auto', 'adaptive', 'adapt', 'default', '2k', '4k'].includes(raw)) {
    return undefined;
  }

  if (/^(square|正方形)$/.test(raw)) return '1:1';
  if (/^(landscape|横版|横屏)$/.test(raw)) return '16:9';
  if (/^(portrait|竖版|竖屏)$/.test(raw)) return '9:16';

  const ratioMatch = raw.match(/^(\d{1,5})\s*[:/]\s*(\d{1,5})$/);
  if (ratioMatch) {
    return normalizeDimensions(Number(ratioMatch[1]), Number(ratioMatch[2]));
  }

  const dimensionMatch = raw.match(/(\d{2,5})\s*(?:x|×|\*)\s*(\d{2,5})/i);
  if (dimensionMatch) {
    return normalizeDimensions(Number(dimensionMatch[1]), Number(dimensionMatch[2]));
  }

  return undefined;
}

function normalizeDimensions(width: number, height: number): string | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width <= 0 || height <= 0 || width > 100000 || height > 100000) return undefined;
  const divisor = getGreatestCommonDivisor(width, height);
  return `${Math.trunc(width / divisor)}:${Math.trunc(height / divisor)}`;
}

function inferAspectRatioFromInput(input: any): string | undefined {
  if (!isPlainObject(input)) return undefined;
  const directCandidates = [
    input.aspectRatio,
    input.aspect_ratio,
    input.ratio,
    input.size,
    input.resolution,
    input.dimensions,
    input.dimension,
    input.outputSize,
    input.output_size,
  ];

  for (const candidate of directCandidates) {
    const aspectRatio = normalizeAspectRatio(candidate);
    if (aspectRatio) return aspectRatio;
  }

  return normalizeDimensions(Number(input.width ?? input.w), Number(input.height ?? input.h));
}

export function enrichOutputHintWithInput(hint: any, input: any): OutputHint | undefined {
  const outputHint = normalizeOutputHint(hint);
  if (!outputHint) return undefined;
  if (outputHint.aspectRatio) return outputHint;
  const aspectRatio = inferAspectRatioFromInput(input);
  return aspectRatio ? { ...outputHint, aspectRatio } : outputHint;
}

export function isMediaOutputHint(hint: any): boolean {
  const outputHint = normalizeOutputHint(hint);
  return outputHint?.type === 'image' || outputHint?.type === 'video';
}

function safeJsonStringify(value: unknown, limit = MODEL_CONTENT_LIMIT): string {
  try {
    return truncate(JSON.stringify(value), limit);
  } catch {
    return truncate(String(value ?? ''), limit);
  }
}

function parseMaybeJson(value: any): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!/^[\[{"]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function basename(value: string): string {
  const cleaned = value.split(/[?#]/)[0];
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || cleaned;
}

export {
  basename,
  escapeRegExp,
  isPlainObject,
  normalizeOutputHint,
  normalizeWhitespace,
  parseMaybeJson,
  safeJsonStringify,
  stripHtml,
  truncate,
};
