import api from '../index';

export default {
  login: (data: { username: string; password: string }) =>
    api.post('auth/login', data),

  permission: () => api.get('auth/getInfo'),

  getInfo: () => api.get('auth/getInfo'),

  queryAllUser: (params: any) => api.get('user/queryAll', { params }),

  updateUserStatus: (data: { status: string }) =>
    api.post('user/updateStatus', data),

  resetUserPassword: (data: { id: number }) =>
    api.post('user/resetUserPass', data),

  sendUserCrami: (data: {
    userId: number;
    model3Count: number;
    model4Count: number;
    drawMjCount: number;
  }) => api.post('user/recharge', data),

  passwordEdit: (data: { oldPassword: string; password: string }) =>
    api.post('auth/updatePassword', data),

  queryUserAccountLog: (params: any) =>
    api.get('balance/accountLog', { params }),
};
