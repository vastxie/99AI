import api from '../index';

export default {
  queryFiles: (params: any) => api.get('files/admin/query', { params }),
  getFile: (fileId: string) => api.get(`files/admin/${fileId}`),
  batchDelete: (data: any) => api.post('files/admin/batch-delete', data),
  clearFiles: (data: any) => api.post('files/admin/clear', data),
  runCleanup: () => api.post('files/admin/cleanup/run'),
};
