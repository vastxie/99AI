import api from '../index';

export default {
  queryAllOrder: (params: any) => api.get('order/queryAll', { params }),
  deleteOrder: (data: any) => api.post('order/delete', data),
  deleteNotPay: () => api.post('order/deleteNotPay'),
};
