import { ToolResultOutputKind } from './types';

const SUMMARY_LIMIT = 240;

const MODEL_CONTENT_LIMIT = 12000;

const PREVIEW_CONTENT_LIMIT = 100 * 1024;

const DETAIL_LIMIT = 5;

const MODEL_RESULT_ITEM_LIMIT = 5;

const MODEL_SUMMARY_LIMIT = 1600;

const MODEL_HEAD_LIMIT = 1200;

const MODEL_TAIL_LIMIT = 700;

const MODEL_LOG_LINES_LIMIT = 8;

const SAFE_INPUT_KEYS = [
  'query',
  'keyword',
  'keywords',
  'location',
  'repo',
  'username',
  'fileName',
  'filename',
  'name',
  'title',
  'type',
  'action',
  'operation',
  'task',
  'description',
  'url',
];

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|cookie|authorization|api[_-]?key|access[_-]?key|refresh|credential|private|session|signature|storage[_-]?path|local[_-]?path|file[_-]?path|real[_-]?path|absolute[_-]?path/i;

const SENSITIVE_TEXT_KEY_PATTERN =
  /token|secret|password|cookie|authorization|api[_-]?key|access[_-]?key|refresh|credential|private|session|signature|storage[_-]?path|local[_-]?path|file[_-]?path|real[_-]?path|absolute[_-]?path|output[_-]?path|temp[_-]?path|x[-_]?amz[-_]?signature|x[-_]?amz[-_]?credential|x[-_]?amz[-_]?security[-_]?token/i;

/** 工具结果里被隐藏的敏感片段占位符；与 common/constants/redaction.constant 的「已脱敏」是两个概念 */
const TOOL_PAYLOAD_HIDDEN_TEXT = '[已隐藏]';

const OUTPUT_HINT_TYPES = new Set(['image', 'video', 'file', 'audio', 'document']);

const VISIBLE_DELIVERY_FILE_ROLES = new Set(['final', 'preview']);

const HIDDEN_DELIVERY_FILE_ROLES = new Set(['source', 'intermediate']);

const SAFE_ARTIFACT_ROLES = new Set([
  ...VISIBLE_DELIVERY_FILE_ROLES,
  ...HIDDEN_DELIVERY_FILE_ROLES,
]);

const TOOL_RESULT_OUTPUT_KINDS = new Set<ToolResultOutputKind>([
  'search',
  'web_read',
  'runtime',
  'file_parse',
  'media_generate',
  'generic',
]);

const BLOCKED_OUTPUT_KEYS = new Set(
  [
    'raw',
    'rawInput',
    'rawOutput',
    'rawContent',
    'rawError',
    'audit',
    'debug',
    'logs',
    'log',
    'stdout',
    'stderr',
    'stack',
    'trace',
    'providerResponse',
    'response',
    'request',
    'headers',
    'cookies',
    'objectKey',
    'object_key',
    'storagePath',
    'localPath',
    'filePath',
    'realPath',
    'absolutePath',
    'outputPath',
    'outputDir',
    'uploadPath',
    'tempPath',
    'artifacts',
    'imageUrl',
    'videoUrl',
    'audioUrl',
    'fileUrl',
    'downloadUrl',
    'previewUrl',
    'fileTree',
    'diff',
    'internal',
    'diagnostics',
  ].map(normalizeKey),
);

const SENSITIVE_TEXT_KEYS = [
  'raw',
  'rawInput',
  'raw_input',
  'rawOutput',
  'raw_output',
  'rawContent',
  'raw_content',
  'rawError',
  'raw_error',
  'audit',
  'debug',
  'logs',
  'log',
  'stdout',
  'stderr',
  'stack',
  'trace',
  'providerResponse',
  'provider_response',
  'response',
  'request',
  'headers',
  'cookies',
  'objectKey',
  'object_key',
  'storagePath',
  'storage_path',
  'localPath',
  'local_path',
  'filePath',
  'file_path',
  'realPath',
  'real_path',
  'absolutePath',
  'absolute_path',
  'outputPath',
  'output_path',
  'outputDir',
  'output_dir',
  'uploadPath',
  'upload_path',
  'tempPath',
  'temp_path',
  'fileTree',
  'file_tree',
  'internal',
  'diagnostics',
  'diff',
  'token',
  'apiKey',
  'api_key',
  'api-key',
  'accessKey',
  'access_key',
  'access-key',
  'secret',
  'password',
  'authorization',
  'credential',
  'signature',
  'x-amz-signature',
  'x_amz_signature',
  'x-amz-credential',
  'x_amz_credential',
  'x-amz-security-token',
  'x_amz_security_token',
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export {
  BLOCKED_OUTPUT_KEYS,
  DETAIL_LIMIT,
  MODEL_CONTENT_LIMIT,
  MODEL_HEAD_LIMIT,
  MODEL_LOG_LINES_LIMIT,
  MODEL_RESULT_ITEM_LIMIT,
  MODEL_SUMMARY_LIMIT,
  MODEL_TAIL_LIMIT,
  OUTPUT_HINT_TYPES,
  PREVIEW_CONTENT_LIMIT,
  TOOL_PAYLOAD_HIDDEN_TEXT,
  SAFE_ARTIFACT_ROLES,
  SAFE_INPUT_KEYS,
  SENSITIVE_KEY_PATTERN,
  SENSITIVE_TEXT_KEYS,
  SENSITIVE_TEXT_KEY_PATTERN,
  SUMMARY_LIMIT,
  TOOL_RESULT_OUTPUT_KINDS,
  VISIBLE_DELIVERY_FILE_ROLES,
  normalizeKey,
};
