import api from '../index';

export default {
  queryAutoReply: (params: { page?: number; size?: number; prompt?: string; status?: number }) =>
    api.get('autoReply/query', { params }),
  delAutoReply: (data: { id: number }) => api.post('autoReply/del', data),
  addAutoReply: (data: { prompt: string; answer: string }) => api.post('autoReply/add', data),
  updateAutoReply: (data: { id: number; prompt: string; answer: string; status: number }) =>
    api.post('autoReply/update', data),
};
