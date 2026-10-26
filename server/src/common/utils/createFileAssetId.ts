import { randomAlphanumeric } from './random-id';

const FILE_ASSET_ID_LENGTH = 24;
const STORAGE_ID_LENGTH = 18;

/** 文件资产公开 ID：file_ + 24 位字母数字（格式判定见 common/constants/id-pattern.constant.ts） */
export function createFileId(length = FILE_ASSET_ID_LENGTH): string {
  return `file_${randomAlphanumeric(length)}`;
}

/** 用户存储空间 ID：stor_ + 18 位字母数字 */
export function createStorageId(length = STORAGE_ID_LENGTH): string {
  return `stor_${randomAlphanumeric(length)}`;
}
