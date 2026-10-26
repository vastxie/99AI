import { Injectable } from '@nestjs/common';
import { isCloudMetadataHost } from '@/common/utils/safe-download.util';
import {
  DEFAULT_MODEL_PROTOCOL,
  ModelGatewayUrlInput,
  ModelGatewayUrlResult,
  ModelProtocolEndpoints,
} from './model-gateway.types';
import { ModelStreamRegistry } from './model-stream';

export interface ModelGatewayUrlBuildOptions {
  /** 当前协议的默认端点（来自协议描述） */
  endpoints: ModelProtocolEndpoints;
  /** 所有已注册协议的端点后缀并集：baseUrl 若已包含其中之一，视为「已含完整端点」 */
  knownSuffixes?: string[];
  /** 内核基线协议（OpenAI Chat Completions）额外给出 SDK 用的 baseUrl */
  deriveOpenAIChatSdkBaseUrl?: boolean;
}

/** 按协议描述构造请求地址：端点规则全部来自注册表，内核不再写死任何协议 */
@Injectable()
export class ModelGatewayUrlBuilder {
  constructor(private readonly registry: ModelStreamRegistry) {}

  build(input: ModelGatewayUrlInput): ModelGatewayUrlResult {
    const protocol = input.protocol || DEFAULT_MODEL_PROTOCOL;
    const descriptor = this.registry.describe(protocol);
    if (!descriptor) {
      throw new Error(`当前暂不支持协议: ${protocol}`);
    }
    return buildModelGatewayRequestUrl(input, {
      endpoints: descriptor.endpoints,
      knownSuffixes: this.registry
        .listDescriptors()
        .flatMap(item => item.endpoints.knownSuffixes || []),
      deriveOpenAIChatSdkBaseUrl: protocol === DEFAULT_MODEL_PROTOCOL,
    });
  }
}

export function buildModelGatewayRequestUrl(
  input: ModelGatewayUrlInput,
  options: ModelGatewayUrlBuildOptions,
): ModelGatewayUrlResult {
  const baseUrl = String(input.baseUrl || '').trim();
  if (!baseUrl) {
    throw new Error('模型 API 基础地址不能为空');
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('模型 API 基础地址不是合法 URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('模型 API 基础地址仅支持 http 或 https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('模型 API 基础地址不能包含用户名或密码');
  }
  if (isCloudMetadataHost(parsed.hostname)) {
    throw new Error('模型 API 基础地址不能指向云平台元数据服务');
  }
  if (parsed.search) {
    throw new Error('模型 API 基础地址不能包含 query 参数');
  }
  if (parsed.hash) {
    throw new Error('模型 API 基础地址不能包含 hash');
  }

  parsed.pathname = stripTrailingSlashes(parsed.pathname || '/');
  const normalizedBaseUrl = stripTrailingSlashes(parsed.toString());
  const warnings: string[] = [];
  const operation = input.operation || 'non_stream';
  const endpoints = options.endpoints;
  const knownSuffixes = options.knownSuffixes?.length
    ? options.knownSuffixes
    : endpoints.knownSuffixes;

  const defaultEndpointPath = resolveDefaultEndpointPath(input.protocol, endpoints, operation);
  const endpointPath = normalizeEndpointPath(input.endpointPath || defaultEndpointPath, input);
  const normalizedPath = stripTrailingSlashes(parsed.pathname || '');
  const hasKnownEndpoint = knownSuffixes.some(suffix => normalizedPath.endsWith(suffix));

  if (hasKnownEndpoint && input.endpointPath) {
    throw new Error('baseUrl 已包含完整 endpoint 时不能再填写 endpointPath');
  }

  let finalUrl: URL;
  let finalEndpointPath = endpointPath;

  if (hasKnownEndpoint) {
    warnings.push('baseUrl_contains_endpoint');
    finalUrl = new URL(normalizedBaseUrl);
    finalEndpointPath = normalizedPath || '/';
    if (operation === 'models_list' && normalizedPath.endsWith('/chat/completions')) {
      const modelsPath = normalizedPath.slice(0, -'/chat/completions'.length) + '/models';
      finalUrl.pathname = modelsPath;
      finalEndpointPath = modelsPath;
    }
  } else {
    const basePath = normalizedPath === '/' ? '' : normalizedPath;
    const pathToAppend = stripEndpointVersionPrefixForVersionedBase(basePath, endpointPath);
    finalUrl = new URL(normalizedBaseUrl);
    finalUrl.pathname = joinUrlPath(basePath, pathToAppend);
    finalEndpointPath = pathToAppend;
  }

  if (operation === 'stream' && endpoints.streamQuery) {
    for (const [key, value] of Object.entries(endpoints.streamQuery)) {
      finalUrl.searchParams.set(key, value);
    }
  }

  const result: ModelGatewayUrlResult = {
    url: finalUrl.toString(),
    normalizedBaseUrl,
    endpointPath: finalEndpointPath,
    warnings,
  };

  if (options.deriveOpenAIChatSdkBaseUrl && operation !== 'models_list') {
    result.openAIChatSdkBaseUrl = deriveOpenAIChatSdkBaseUrl(finalUrl);
  }

  return result;
}

function resolveDefaultEndpointPath(
  protocol: string,
  endpoints: ModelProtocolEndpoints,
  operation: ModelGatewayUrlInput['operation'],
): string {
  if (operation === 'models_list') {
    if (!endpoints.modelsList) {
      throw new Error(`当前协议暂不支持远程模型列表: ${protocol}`);
    }
    return endpoints.modelsList;
  }
  if (operation === 'stream' && endpoints.stream) {
    return endpoints.stream;
  }
  return endpoints.default;
}

function normalizeEndpointPath(path: string, input: ModelGatewayUrlInput): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized.includes('{model}')) {
    if (!input.model) throw new Error('当前 endpointPath 需要模型名称');
    return normalized.replace('{model}', encodeURIComponent(input.model));
  }
  return normalized;
}

function stripTrailingSlashes(value: string): string {
  if (!value || value === '/') return value;
  return value.replace(/\/+$/, '');
}

function joinUrlPath(basePath: string, endpointPath: string): string {
  const left = stripTrailingSlashes(basePath || '');
  const right = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${left}${right}` || '/';
}

function stripEndpointVersionPrefixForVersionedBase(
  basePath: string,
  endpointPath: string,
): string {
  const baseVersion = basePath.match(/\/v\d+(?:beta|alpha)?$/i)?.[0];
  if (!baseVersion) {
    return endpointPath;
  }
  const endpointVersion = endpointPath.match(/^\/v\d+(?:beta|alpha)?(?=\/|$)/i)?.[0];
  if (endpointVersion) {
    return endpointPath.slice(endpointVersion.length) || '/';
  }
  return endpointPath;
}

function deriveOpenAIChatSdkBaseUrl(finalUrl: URL): string {
  const url = new URL(finalUrl.toString());
  const path = stripTrailingSlashes(url.pathname);
  if (!path.endsWith('/chat/completions')) {
    throw new Error('OpenAI Chat Completions endpointPath 必须以 /chat/completions 结尾');
  }
  url.pathname = path.slice(0, -'/chat/completions'.length) || '/';
  url.search = '';
  return stripTrailingSlashes(url.toString());
}
