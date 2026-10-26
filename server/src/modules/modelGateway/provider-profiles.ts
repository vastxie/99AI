import { deriveCapabilitiesFromMultimodalTypes } from './model-gateway.types';
import type { ModelGatewayCapabilities, ModelProtocolDescriptor } from './model-gateway.types';
import type {
  ModelGatewayCatalogItem,
  ModelGatewayProtocolOption,
  ModelGatewayProtocolProfiles,
  ModelGatewayProviderProfilePayload,
} from './provider-profiles.types';

/** 按多模态类型推导能力，再叠加显式覆盖（各协议的预设数据共用） */
export const defineModelGatewayCapabilities = (
  multimodalTypes: string[],
  overrides: ModelGatewayCapabilities = {},
): ModelGatewayCapabilities => ({
  ...deriveCapabilitiesFromMultimodalTypes(multimodalTypes),
  ...overrides,
});

type CatalogItemInput = Omit<ModelGatewayCatalogItem, 'capabilities'> & {
  reasoning?: ModelGatewayCapabilities['reasoning'];
};

export const defineModelGatewayCatalogItem = ({
  reasoning,
  ...item
}: CatalogItemInput): ModelGatewayCatalogItem => ({
  ...item,
  multimodalTypes: [...item.multimodalTypes],
  capabilities: defineModelGatewayCapabilities(
    item.multimodalTypes,
    reasoning ? { reasoning } : undefined,
  ),
});

const toPublicCatalogItem = (item: ModelGatewayCatalogItem): ModelGatewayCatalogItem => ({
  ...item,
  multimodalTypes: [...item.multimodalTypes],
  capabilities: { ...item.capabilities },
  defaultAdditionalParams: item.defaultAdditionalParams
    ? { ...item.defaultAdditionalParams }
    : undefined,
});

function profilesOf(descriptor: ModelProtocolDescriptor): ModelGatewayProtocolProfiles {
  const profiles = descriptor.profiles as ModelGatewayProtocolProfiles | undefined;
  return {
    contentProfiles: profiles?.contentProfiles ?? [],
    catalog: profiles?.catalog ?? [],
    providerProfiles: profiles?.providerProfiles ?? [],
  };
}

/** 给管理端的协议列表 + 厂商预设 + 模型目录：只包含当前装载的协议 */
export function buildModelGatewayProviderProfilePayload(
  descriptors: ModelProtocolDescriptor[],
): ModelGatewayProviderProfilePayload {
  const protocols: ModelGatewayProtocolOption[] = descriptors.map(descriptor => ({
    value: descriptor.protocol,
    label: descriptor.label,
    supportsRemoteModelList: Boolean(descriptor.endpoints.modelsList),
    supportsNativeWebSearch: Boolean(descriptor.supportsNativeWebSearch),
    multimodalTypes: [...descriptor.multimodalTypes],
  }));
  const catalog = descriptors.flatMap(descriptor => profilesOf(descriptor).catalog);
  const profiles = descriptors.flatMap(descriptor =>
    profilesOf(descriptor).providerProfiles.map(profile => ({
      key: profile.key,
      label: profile.label,
      description: profile.description,
      protocol: profile.protocol,
      baseUrl: profile.baseUrl,
      endpointPath: profile.endpointPath,
      supportsRemoteModelList: profile.supportsRemoteModelList,
      defaultMultimodalTypes: [...profile.defaultMultimodalTypes],
      defaultCapabilities: { ...profile.defaultCapabilities },
      defaultAdditionalParams: profile.defaultAdditionalParams
        ? { ...profile.defaultAdditionalParams }
        : undefined,
      modelCatalog: catalog
        .filter(
          item => item.providerKey === profile.key && profile.modelCatalogKeys.includes(item.id),
        )
        .map(toPublicCatalogItem),
    })),
  );
  return {
    protocols,
    profiles,
    catalog: catalog.map(toPublicCatalogItem),
  };
}
