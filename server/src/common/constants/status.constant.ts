/**
 * chat_log.status 消息生命周期状态。
 * 前端镜像：web/src/constants/chatLogStatus.ts，修改须同步。
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
  /** 已停止（用户中止 / 启动期清扫遗留任务） */
  STOPPED = 5,
}
