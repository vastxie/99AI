/**
 * 消息生命周期状态（chat_log.status）。
 * 后端正源：server/src/common/constants/status.constant.ts 的 ChatLogStatus，修改须同步。
 */
export enum ChatLogStatus {
  /** 已创建待执行 */
  PENDING = 1,
  /** 生成中 */
  GENERATING = 2,
  /** 已完成 */
  COMPLETED = 3,
  /** 失败 */
  FAILED = 4,
  /** 已停止（用户中止 / 服务端清扫） */
  STOPPED = 5,
}
