import api from '../index';

export default {
  /**
   * 上传文件
   * @param data FormData对象，必须包含file字段
   * @param dir 可选的目录参数
   * @returns
   */
  uploadFile: (
    data: FormData,
    dir?: string,
    options?: { purpose?: string; visibility?: string },
  ) => {
    const query = new URLSearchParams();
    if (dir) query.set('dir', dir);
    if (options?.purpose) query.set('purpose', options.purpose);
    if (options?.visibility) query.set('visibility', options.visibility);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const url = `upload/file${suffix}`;
    return api.post(url, data);
  },
};
