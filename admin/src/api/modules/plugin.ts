import api from '../index';

export default {
  pluginList: (params: any) => api.get('plugin/pluginList', { params }),
  delPlugin: (data: { id: number }) => api.post('plugin/delPlugin', data),
  createPlugin: (data: any) => api.post('plugin/createPlugin', data),
  updatePlugin: (data: any) => api.post('plugin/updatePlugin', data),
};
