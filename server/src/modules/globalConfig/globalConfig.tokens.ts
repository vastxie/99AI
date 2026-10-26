export const GLOBAL_CONFIG_SERVICE = 'GLOBAL_CONFIG_SERVICE';

export interface GlobalConfigReader {
  getConfigs(configKey: string[]): Promise<any>;
}
