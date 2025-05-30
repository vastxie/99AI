import api from '../index';

export default {
  // 创建自定义菜单
  createOfficialMenu: (data: any) => api.post('official/menu', data),
  // 查询自定义菜单
  queryOfficialMenu: () => api.get('official/menu'),
  // 删除自定义菜单
  deleteOfficialMenu: () => api.delete('official/menu'),
};
