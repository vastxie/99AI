import api from '@/api/index';

export default {
  fetchBotChannelStats: () => api.get('bot/admin/stats'),
  fetchChannelUsers: (channel: string, params: any) =>
    api.get(`bot/admin/channels/${channel}/users`, { params }),
  disableChannelUser: (channel: string, userId: number) =>
    api.post(`bot/admin/channels/${channel}/users/${userId}/disable`),
  enableChannelUser: (channel: string, userId: number) =>
    api.post(`bot/admin/channels/${channel}/users/${userId}/enable`),
};
