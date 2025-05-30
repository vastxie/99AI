import { Logger } from '@nestjs/common';
import axios from 'axios';
/**
 * 将URL转换为Base64
 * @param url - 需要转换的URL
 * @returns 转换后的Base64字符串
 */
export async function convertUrlToBase64(url: string): Promise<string> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary'); // 获取图片的二进制数据
    const base64Data = `data:${response.headers['content-type']};base64,${buffer.toString(
      'base64',
    )}`;
    return base64Data;
  } catch (error) {
    Logger.error('下载图片失败', error);
    return url;
  }
}
