import api from '../index';

export default {
  queryChatAll: (params: any) => api.get('chatLog/chatAll', { params }),
  queryDrawAll: (params: any) => api.get('chatLog/drawAll', { params }),
  recDrawImg: (data: { id: number }) => api.post('chatLog/recDrawImg', data),
};
