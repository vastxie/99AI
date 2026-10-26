/**
 * 跨模块共用的 ID 格式常量，只用于 .test() 判定（不带 g 标志）。
 * 对话组 gid 见 common/utils/createChatGroupGid.ts 的 CHAT_GROUP_GID_PATTERN。
 */

/** 文件资产公开 ID：file_ + 24 位字母数字，与 createFileId 的固定长度一致 */
export const FILE_ID_PATTERN = /^file_[0-9A-Za-z]{24}$/;

/** Agent 回合 ID */
export const TURN_ID_PATTERN = /^turn_[A-Za-z0-9_-]{1,120}$/;

/** Agent 操作 ID（一次回合内的执行单元） */
export const OPERATION_ID_PATTERN = /^op_turn_[A-Za-z0-9_-]{1,120}$/;

/** 文件引用：attachment_1 / output_image_2 / output_file_3 / previous_file_4 */
export const FILE_REF_PATTERN = /^(attachment|output_image|output_file|previous_file)_[1-9]\d*$/;
