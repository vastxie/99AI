import api from '@/api/index';

export default {
  // 创建自定义菜单
  createOfficialMenu: (data: any) => api.post('official/menu', data),
  // 查询自定义菜单
  queryOfficialMenu: () => api.get('official/menu'),
  // 删除自定义菜单
  deleteOfficialMenu: () => api.delete('official/menu'),
  // 素材管理
  // 获取素材列表
  getMaterialList: (params: { type: string; offset?: number; count?: number }) =>
    api.get('official/material/list', { params }),
};
