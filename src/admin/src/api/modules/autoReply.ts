import api from '../index'

export default {
  queryAutoReply: (params: {
    page?: number
    size?: number
    prompt?: string
    status?: number
  }) => api.get('autoreply/query', { params }),
  delAutoReply: (data: { id: number }) => api.post('autoreply/del', data),
  addAutoReply: (data: {
    prompt: string
    answer: string
  }) => api.post('autoreply/add', data),
  updateAutoReply: (data: {
    id: number
    prompt: string
    answer: string
    status: number
  }) => api.post('autoreply/update', data),
}
