/** 一条违规记录的最小投影（用户画像展示用） */
export interface ViolationRecord {
  id: number;
  userId: number;
  typeCn?: string | null;
  typeOriginCn?: string | null;
  createdAt: Date;
}

export interface UserViolationStats {
  /** 历史违规总数 */
  total: number;
  /** 统计区间内的违规数 */
  inRange: number;
  /** 最近一次违规时间 */
  latestAt: Date | string | null;
  /** 按来源聚合的前几名 */
  bySource: Array<{ source: string; count: number }>;
}
