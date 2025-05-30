import api from '../index';

export default {
  queryMcpConfig: (params: any) => api.get('model-context-protocol', { params }),
  deleteMcpConfig: (id: number) => api.delete(`model-context-protocol/${id}`),
  setMcpConfig: (data: any) => api.post('model-context-protocol', data),
  updateMcpConfig: (id: number, data: any) => api.put(`model-context-protocol/${id}`, data),
};
