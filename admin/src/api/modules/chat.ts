import api from '../index';

export default {
  queryChatAll: (params: any) => api.get('chatLog/chatAll', { params }),
};
