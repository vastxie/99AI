/**
 * 文件类型扩展名常量（全站唯一定义）。
 * 此前 MediaOutput 与文件列表各自维护已出现漂移（code 集合差 9 项），
 * 本文件取两者并集；分类判定处统一先查视频集再查音频集（webm 同属两类）。
 */

export const IMAGE_FILE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'tif',
  'tiff',
  'webp',
])

export const VIDEO_FILE_EXTENSIONS = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm'])

export const AUDIO_FILE_EXTENSIONS = new Set([
  'aac',
  'flac',
  'm4a',
  'mp3',
  'ogg',
  'opus',
  'wav',
  'webm',
])

export const PDF_FILE_EXTENSIONS = new Set(['pdf'])
export const SPREADSHEET_FILE_EXTENSIONS = new Set(['csv', 'xls', 'xlsx'])
export const WORD_FILE_EXTENSIONS = new Set(['doc', 'docx'])
export const PRESENTATION_FILE_EXTENSIONS = new Set(['ppt', 'pptx'])
export const MARKDOWN_FILE_EXTENSIONS = new Set(['markdown', 'md'])
export const ARCHIVE_FILE_EXTENSIONS = new Set(['7z', 'gz', 'rar', 'tar', 'zip'])

export const CODE_FILE_EXTENSIONS = new Set([
  'c',
  'cjs',
  'conf',
  'cpp',
  'css',
  'env',
  'go',
  'h',
  'hpp',
  'htm',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'less',
  'log',
  'mjs',
  'php',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'svelte',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
  'zsh',
])
