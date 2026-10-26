import type { ModelGatewayCapabilities, ModelProtocol } from './model-gateway.types';

export type ModelGatewayAudioInputStyle =
  'input_audio_data_format' | 'input_audio_audio_url' | 'inline_data';

export type ModelGatewayDocumentInputStyle =
  'input_file_file_data' | 'document_source' | 'inline_data';

export type ModelGatewayVideoInputStyle = 'video_url' | 'input_video_video_url' | 'inline_data';

export interface ModelGatewayContentProfile {
  key: string;
  label: string;
  fileDataRequiresDataUrl?: boolean;
  documentFilenameRequired?: boolean;
  documentInputStyle?: ModelGatewayDocumentInputStyle;
  documentInputMimeTypes?: string[];
  audioInputStyle?: ModelGatewayAudioInputStyle;
  videoInputStyle?: ModelGatewayVideoInputStyle;
  reasoningFormat?: 'none' | 'reasoning_content' | 'reasoning_summary';
}

export interface ModelGatewayCatalogItem {
  id: string;
  label?: string;
  providerKey: string;
  protocol: ModelProtocol;
  maxTokens: number;
  multimodalTypes: string[];
  capabilities: ModelGatewayCapabilities;
  defaultEndpointPath?: string;
  defaultAdditionalParams?: Record<string, unknown>;
}

export interface ModelGatewayProviderProfile {
  key: string;
  label: string;
  description?: string;
  protocol: ModelProtocol;
  baseUrl: string;
  endpointPath?: string;
  modelsEndpointPath?: string;
  supportsRemoteModelList: boolean;
  contentProfileKey: string;
  defaultMultimodalTypes: string[];
  defaultCapabilities: ModelGatewayCapabilities;
  defaultAdditionalParams?: Record<string, unknown>;
  modelCatalogKeys: string[];
}

export type ModelGatewayPublicProviderProfile = Pick<
  ModelGatewayProviderProfile,
  | 'key'
  | 'label'
  | 'description'
  | 'protocol'
  | 'baseUrl'
  | 'endpointPath'
  | 'supportsRemoteModelList'
  | 'defaultMultimodalTypes'
  | 'defaultCapabilities'
  | 'defaultAdditionalParams'
> & {
  modelCatalog: ModelGatewayCatalogItem[];
};

/** 管理端「调用协议」下拉与协议特性 */
export interface ModelGatewayProtocolOption {
  value: string;
  label: string;
  supportsRemoteModelList: boolean;
  supportsNativeWebSearch: boolean;
  multimodalTypes: string[];
}

/** 一个协议随适配器登记的预设数据 */
export interface ModelGatewayProtocolProfiles {
  contentProfiles: ModelGatewayContentProfile[];
  catalog: ModelGatewayCatalogItem[];
  providerProfiles: ModelGatewayProviderProfile[];
}

export interface ModelGatewayProviderProfilePayload {
  protocols: ModelGatewayProtocolOption[];
  profiles: ModelGatewayPublicProviderProfile[];
  catalog: ModelGatewayCatalogItem[];
}
