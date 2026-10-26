import { defineOptions } from '@/utils/options';

export const { options: USER_STATUS_OPTIONS, map: USER_STATUS_MAP } = defineOptions([
  { value: 0, label: '待激活' },
  { value: 1, label: '正常' },
  { value: 2, label: '已封禁' },
  { value: 3, label: '黑名单' },
  // 添加游客状态
  { value: 4, label: '游客' },
]);

export type UserStatus = keyof typeof USER_STATUS_MAP;

/** 用户状态 tag 语义色：正常 success，待激活中性，游客提醒，封禁 / 黑名单 danger */
export const USER_STATUS_TAG_TYPE: Record<UserStatus, 'success' | 'info' | 'warning' | 'danger'> = {
  0: 'info',
  1: 'success',
  2: 'danger',
  3: 'danger',
  4: 'warning',
};

/** 「变更用户状态」可选项：游客(4) 是系统态，后端不接受手动设置 */
export const USER_STATUS_CHANGE_OPTIONS = USER_STATUS_OPTIONS.filter((item) => item.value !== 4);

// 问题状态 0 未解决 1 已解决
export const QUESTION_STATUS_OPTIONS = [
  { value: '0', label: '未启用' },
  { value: '1', label: '已启用' },
];
