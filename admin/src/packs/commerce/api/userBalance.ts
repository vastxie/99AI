import api from '@/api/index';

/** 用户积分调整、套餐赠送与账户明细（商业包） */
export default {
  rechargeUser: (data: { userId: number; credits: number }) => api.post('user/recharge', data),
  grantPackage: (data: { userId: number; packageId: number }) =>
    api.post('user/grantPackage', data),
  queryUserAccountLog: (params: any) => api.get('balance/accountLog', { params }),
};
