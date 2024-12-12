import api from '../index'

export default {
  queryBadWords: (params = {}) => api.get('badwords/query', { params }),
  queryViolation: (params = {}) => api.get('badwords/violation', { params }),
  delBadWords: (data: { id: number }) => api.post('badwords/del', data),
  addBadWords: (data: { word: string }) => api.post('badwords/add', data),
  updateBadWords: (data: {
    id: number
    word: string
    status: number
  }) => api.post('badwords/update', data),
}
