import api from '@/api/index';

/** 支付配置状态、可用支付方式与支付测试（商业包） */
export default {
  getPaymentChannelStatus: () => api.get('config/payment/channel-status'),
  getPaymentMethods: () => api.get('config/payment/methods'),
  createFullPaymentTest: (data: { method: string; packageId?: number }) =>
    api.post('pay/test/full-flow', data),
  queryFullPaymentTest: (orderId: string) => api.get(`pay/test/full-flow/${orderId}`),
};
