import api from '@/api/index';

export default {
  /* ========== 词库管理 ========== */
  queryVocabularies: () => api.get('badwords/vocabularies'),

  /* ========== 白名单管理 ========== */
  queryWhitelist: (params = {}) => api.get('badwords/whitelist', { params }),
  addWhitelist: (data: { word: string; remark?: string }) =>
    api.post('badwords/whitelist/add', data),
  batchAddWhitelist: (data: { words: string }) => api.post('badwords/whitelist/batchAdd', data),
  delWhitelist: (data: { id: number }) => api.post('badwords/whitelist/del', data),
  updateWhitelist: (data: { id: number; word?: string; remark?: string }) =>
    api.post('badwords/whitelist/update', data),

  /* ========== 腾讯云文本审核 ========== */
  testTencentTextConfig: () => api.post('badwords/testTencentTextConfig'),

  /* ========== 违规记录 ========== */
  queryViolation: (params = {}) => api.get('badwords/violation', { params }),
};
