// 模型能力信息（仅包含系统预设模型的能力数据）
// I=图片输入  D=PDF 文档输入  V=视频输入  A=音频输入  T=工具调用  R=推理/思考模式
export interface ModelInfo {
  id: string;
  maxTokens: number;
  multimodalTypes: string[];
  tools: boolean;
  thinking: boolean;
}

export const MODEL_LIST: ModelInfo[] = [
  // ========== OpenAI ==========
  {
    id: 'gpt-5.4',
    maxTokens: 1050000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5.4-pro',
    maxTokens: 1050000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5.4-mini',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5.4-nano',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5.2',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5.2-pro',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5.1',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5-pro',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5-mini',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-5-nano',
    maxTokens: 400000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-4o',
    maxTokens: 128000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'gpt-4o-mini',
    maxTokens: 128000,
    multimodalTypes: ['image_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  { id: 'o3', maxTokens: 200000, multimodalTypes: ['image_url'], tools: true, thinking: true },
  { id: 'o4-mini', maxTokens: 200000, multimodalTypes: ['image_url'], tools: true, thinking: true },

  // ========== Anthropic (Claude) ==========
  {
    id: 'claude-opus-4-7',
    maxTokens: 1000000,
    multimodalTypes: ['image_url', 'document'],
    tools: true,
    thinking: true,
  },
  {
    id: 'claude-opus-4-6',
    maxTokens: 1000000,
    multimodalTypes: ['image_url', 'document'],
    tools: true,
    thinking: true,
  },
  {
    id: 'claude-sonnet-4-6',
    maxTokens: 1000000,
    multimodalTypes: ['image_url', 'document'],
    tools: true,
    thinking: true,
  },
  {
    id: 'claude-sonnet-4-5',
    maxTokens: 1000000,
    multimodalTypes: ['image_url', 'document'],
    tools: true,
    thinking: true,
  },
  {
    id: 'claude-haiku-4-5',
    maxTokens: 200000,
    multimodalTypes: ['image_url', 'document'],
    tools: true,
    thinking: true,
  },
  {
    id: 'claude-opus-4-5',
    maxTokens: 200000,
    multimodalTypes: ['image_url', 'document'],
    tools: true,
    thinking: true,
  },
  {
    id: 'claude-opus-4',
    maxTokens: 200000,
    multimodalTypes: ['image_url', 'document'],
    tools: true,
    thinking: true,
  },
  {
    id: 'claude-sonnet-4-0',
    maxTokens: 200000,
    multimodalTypes: ['image_url', 'document'],
    tools: true,
    thinking: true,
  },

  // ========== Google (Gemini) ==========
  {
    id: 'gemini-3.1-pro-preview',
    maxTokens: 1048576,
    multimodalTypes: ['image_url', 'document', 'video_url', 'audio_url'],
    tools: true,
    thinking: true,
  },
  {
    id: 'gemini-3-flash-preview',
    maxTokens: 1048576,
    multimodalTypes: ['image_url', 'document', 'video_url', 'audio_url'],
    tools: true,
    thinking: true,
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    maxTokens: 1048576,
    multimodalTypes: ['image_url', 'document', 'video_url', 'audio_url'],
    tools: true,
    thinking: true,
  },
  {
    id: 'gemini-2.5-pro',
    maxTokens: 1048576,
    multimodalTypes: ['image_url', 'document', 'video_url', 'audio_url'],
    tools: true,
    thinking: true,
  },
  {
    id: 'gemini-2.5-flash',
    maxTokens: 1048576,
    multimodalTypes: ['image_url', 'document', 'video_url', 'audio_url'],
    tools: true,
    thinking: true,
  },

  // ========== DeepSeek ==========
  { id: 'deepseek-v4-pro', maxTokens: 1048576, multimodalTypes: [], tools: true, thinking: true },
  { id: 'deepseek-v4-flash', maxTokens: 1048576, multimodalTypes: [], tools: true, thinking: true },
  { id: 'deepseek-chat', maxTokens: 131072, multimodalTypes: [], tools: true, thinking: false },
  { id: 'deepseek-reasoner', maxTokens: 131072, multimodalTypes: [], tools: true, thinking: true },

  // ========== xAI (Grok) ==========
  { id: 'grok-4', maxTokens: 131072, multimodalTypes: ['image_url'], tools: true, thinking: true },
  { id: 'grok-3', maxTokens: 131072, multimodalTypes: [], tools: true, thinking: false },
  { id: 'grok-3-mini', maxTokens: 131072, multimodalTypes: [], tools: true, thinking: true },

  // ========== 小米 (MiMo) ==========
  {
    id: 'mimo-v2.5',
    maxTokens: 1048576,
    multimodalTypes: ['image_url', 'video_url', 'audio_url'],
    tools: true,
    thinking: false,
  },
  { id: 'mimo-v2.5-pro', maxTokens: 1048576, multimodalTypes: [], tools: true, thinking: false },
  { id: 'mimo-v2-pro', maxTokens: 1048576, multimodalTypes: [], tools: true, thinking: false },
  { id: 'mimo-v2-flash', maxTokens: 262144, multimodalTypes: [], tools: true, thinking: false },

  // ========== 智谱 (GLM) ==========
  { id: 'glm-5.1', maxTokens: 200000, multimodalTypes: [], tools: true, thinking: false },
  { id: 'glm-5', maxTokens: 200000, multimodalTypes: [], tools: true, thinking: false },
  { id: 'glm-5-turbo', maxTokens: 200000, multimodalTypes: [], tools: true, thinking: false },
  {
    id: 'glm-5v-turbo',
    maxTokens: 200000,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: false,
  },

  // ========== 月之暗面 (Kimi) ==========
  {
    id: 'kimi-k2.6',
    maxTokens: 262144,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'kimi-k2.5',
    maxTokens: 262144,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: false,
  },
  { id: 'kimi-k2', maxTokens: 131072, multimodalTypes: [], tools: true, thinking: false },
  { id: 'moonshot-v1-128k', maxTokens: 131072, multimodalTypes: [], tools: false, thinking: false },

  // ========== 阿里 (Qwen) ==========
  { id: 'qwen3.6-plus', maxTokens: 1048576, multimodalTypes: [], tools: true, thinking: false },
  { id: 'qwen3-coder-plus', maxTokens: 1048576, multimodalTypes: [], tools: true, thinking: false },
  {
    id: 'qwen3.5-plus',
    maxTokens: 131072,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: false,
  },
  {
    id: 'qwen3.5-flash',
    maxTokens: 1048576,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: false,
  },
  { id: 'qwen-max', maxTokens: 32768, multimodalTypes: [], tools: true, thinking: false },
  { id: 'qwen-plus', maxTokens: 131072, multimodalTypes: [], tools: true, thinking: false },
  { id: 'qwen-turbo', maxTokens: 1048576, multimodalTypes: [], tools: true, thinking: false },

  // ========== MiniMax ==========
  { id: 'MiniMax-M2.7', maxTokens: 204800, multimodalTypes: [], tools: true, thinking: false },
  {
    id: 'MiniMax-M2.7-highspeed',
    maxTokens: 204800,
    multimodalTypes: [],
    tools: true,
    thinking: false,
  },
  { id: 'MiniMax-M2.5', maxTokens: 204800, multimodalTypes: [], tools: true, thinking: false },
  { id: 'MiniMax-M2.1', maxTokens: 204800, multimodalTypes: [], tools: true, thinking: false },

  // ========== 字节 (Doubao) ==========
  {
    id: 'doubao-seed-2-0-pro-260215',
    maxTokens: 262144,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: true,
  },
  {
    id: 'doubao-seed-2-0-lite-260215',
    maxTokens: 262144,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: true,
  },
  {
    id: 'doubao-seed-2-0-mini-260215',
    maxTokens: 262144,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: true,
  },
  {
    id: 'doubao-seed-2-0-code-preview-260215',
    maxTokens: 262144,
    multimodalTypes: ['image_url', 'video_url'],
    tools: true,
    thinking: false,
  },
];
