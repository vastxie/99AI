import api from '@/api/index';

export default {
  queryAllPackage: (params: any) => api.get('package/queryAllPackage', { params }),
  queryPackagePlans: (params: any) => api.get('package/queryPlans', { params }),
  updatePackage: (data: any) => api.post('package/updatePackage', data),
  createPackage: (data: any) => api.post('package/createPackage', data),
  delPackage: (data: any) => api.post('package/delPackage', data),
};
