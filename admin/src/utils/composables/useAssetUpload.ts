import axios from 'axios';
import uploadApi from '@/api/modules/upload';

/** 上传接口响应中提取最终可访问 URL */
export function getUploadedUrl(data: any): string {
  return typeof data === 'string'
    ? data
    : data?.publicUrl || data?.previewUrl || data?.downloadUrl || data?.url || '';
}

/**
 * 公共资源上传管线：上传到指定目录、按 URL 回源下载、一键重传。
 * 供 logo/favicon、模型头像、预设封面等“URL + 上传按钮”场景复用。
 */
export default function useAssetUpload(uploadDir: string) {
  function uploadAsset(file: File | Blob) {
    const form = new FormData();
    form.append('file', file);
    return uploadApi.uploadFile(form, uploadDir, {
      purpose: 'public_asset',
      visibility: 'public',
    });
  }

  async function downloadAsset(url: string): Promise<File> {
    const response = await axios.get(url, { responseType: 'blob' });
    let fileName = '';
    const disposition = response.headers?.['content-disposition'];
    if (disposition) {
      const match = /filename="([^"]+)"/u.exec(disposition);
      if (match) fileName = match[1];
    }
    if (!fileName) {
      const pathname = new URL(url, window.location.origin).pathname;
      fileName = pathname.slice(pathname.lastIndexOf('/') + 1) || 'downloaded_file';
    }
    return new File([response.data], fileName, { type: response.data.type });
  }

  /** 下载现有资源并重新上传，返回新 URL；失败时抛出异常由调用方回滚 */
  async function reuploadAsset(currentUrl: string): Promise<string> {
    const file = await downloadAsset(currentUrl);
    const response = await uploadAsset(file);
    const url = getUploadedUrl(response.data);
    if (!url) {
      throw new Error('上传成功但未获取到文件地址');
    }
    return url;
  }

  return { uploadAsset, downloadAsset, reuploadAsset };
}
