/** 通道无关的统一媒体描述 */
export interface MediaItem {
  type: 'image' | 'video' | 'file' | 'audio';
  url: string;
  fileId?: string;
  previewUrl?: string;
  downloadUrl?: string;
  mime?: string;
  size?: number;
  name?: string;
}
