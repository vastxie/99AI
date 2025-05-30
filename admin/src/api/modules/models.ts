import api from '../index';

export default {
  queryModels: (params: any) => api.get('models/query', { params }),
  setModels: (data: any) => api.post('models/setModel', data),
  delModels: (data: any) => api.post('models/delModel', data),
};
