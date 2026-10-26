import api from '../index';

export default {
  queryModels: (params: any) => api.get('models/query', { params }),
  setModels: (data: any) => api.post('models/setModel', data),
  setModelStatus: (data: any) => api.post('models/setModelStatus', data),
  delModels: (data: any) => api.post('models/delModel', data),
  previewRequestUrl: (data: any) => api.post('models/previewRequestUrl', data),
  testConnection: (data: any) =>
    api.post('models/testConnection', data, { timeout: 1000 * 60 * 4 }),
  listRemoteModels: (data: any) => api.post('models/listRemoteModels', data),
  gatewayProfiles: () => api.get('models/gatewayProfiles'),
};
