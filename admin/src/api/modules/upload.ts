import api from '../index';

export default {
  /**
   * 上传文件
   * @param data FormData对象，必须包含file字段
   * @param dir 可选的目录参数
   * @returns
   */
  uploadFile: (data: FormData, dir?: string) => {
    const url = dir ? `upload/file?dir=${encodeURIComponent(dir)}` : 'upload/file';
    return api.post(url, data);
  },
};
