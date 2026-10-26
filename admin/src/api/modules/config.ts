import api from '../index';

interface KeyValue {
  configKey: string;
  configVal: any;
}

export default {
  queryAllConfig: () => api.get('config/queryAll'),
  queryConfig: (data: any) => api.post('config/query', data),
  setConfig: (data: { settings: KeyValue[] }) => api.post('config/set', data),
};
