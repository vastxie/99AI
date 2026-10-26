import api from '../index';

export default {
  login: (data: { username: string; password: string }) => api.post('auth/login', data),

  getInfo: () => api.get('auth/getInfo'),

  queryAllUser: (params: any) => api.get('user/queryAll', { params }),

  getUserProfile: (id: number, params?: any) => api.get(`user/${id}/profile`, { params }),

  updateUserStatus: (data: { status: number; id: number }) => api.post('user/updateStatus', data),

  resetUserPassword: (data: { id: number }) => api.post('user/resetUserPass', data),

  passwordEdit: (data: { oldPassword: string; password: string }) =>
    api.post('auth/updatePassword', data),

  updateProfile: (data: { username?: string; nickname?: string; avatar?: string }) =>
    api.post('user/update', data),
};
