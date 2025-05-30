import api from '../index';

export default {
  queryCats: (params: any) => api.get('app/queryAppCats', { params }),
  deleteCats: (data: { id: number }) => api.post('app/delAppCats', data),
  createCats: (data: any) => api.post('app/createAppCats', data),
  updateCats: (data: any) => api.post('app/updateAppCats', data),
  queryApp: (params: any) => api.get('app/queryApp', { params }),
  deleteApp: (data: { id: number }) => api.post('app/delApp', data),
  createApp: (data: any) => api.post('app/createApp', data),
  updateApp: (data: any) => api.post('app/updateApp', data),
};
