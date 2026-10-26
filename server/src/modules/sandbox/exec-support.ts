/**
 * 执行封装的共用逻辑：命令包装（超时 + 进程组）、输出收集与截断。
 * Docker 与本机两个驱动共用，便于单测。
 */

import { shellQuote } from './sandbox.port';

export const DEFAULT_EXEC_TIMEOUT_SEC = 120;
export const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
export const EXEC_STATE_DIR = '/tmp/.sbx';

/**
 * 把用户命令包成：记录进程身份 → 硬超时 → 用户 shell。
 * `timeout` 未加 --foreground 时会把命令放进独立进程组，超时对整个进程组发 KILL；
 * 我们把外层 bash 的 pid（exec 后即 timeout 的 pid，也是进程组 id）和它的启动时刻
 * （/proc/<pid>/stat 第 22 项，exec 前后不变）写到状态文件，宿主取消时核对身份后按进程组 KILL。
 */
export function wrapCommand(execId: string, command: string, timeoutSec: number): string {
  const pidFile = `${EXEC_STATE_DIR}/${execId}.pid`;
  const seconds = Math.max(1, Math.floor(timeoutSec));
  return [
    `/usr/bin/mkdir -p ${EXEC_STATE_DIR}`,
    // 正常结束的命令不会回收自己的 pid 文件（exec 已替换 shell），顺手清掉一小时前的旧文件
    `(/usr/bin/find ${EXEC_STATE_DIR} -name '*.pid' -mmin +60 -delete 2>/dev/null || true)`,
    // 读不到启动时刻也照常运行，只是之后无法核对身份，结束命令不会对它发信号
    `{ read -r s < /proc/$$/stat; s=\${s##*) }; set -- $s; echo "$$ \${20}"; } > ${shellQuote(pidFile)} 2>/dev/null`,
    `exec /usr/bin/timeout -s KILL ${seconds}s /bin/bash --noprofile --norc -c ${shellQuote(command)}`,
  ].join(' && ');
}

/**
 * 取消或截止时执行：核对状态文件里的进程身份后，按进程组 KILL 整棵树。
 * - 结束请求可能早于命令写下进程编号（启动结果还没返回），所以先最多等 5 秒
 * - 只在确认身份时发信号：编号对应的进程还在、启动时刻与记录一致，按进程组结束；
 *   进程组还没建立（timeout 尚未自立进程组）时退回结束这个进程本身
 * - 记录不全、进程已经不在或读不到：不发信号（主进程结束后留下的后台进程不由这里处理）
 * 读到编号才删状态文件，等不到时不删，留给之后的结束请求
 */
export function killCommand(execId: string): string {
  const pidFile = shellQuote(`${EXEC_STATE_DIR}/${execId}.pid`);
  return [
    `i=0; while [ ! -s ${pidFile} ] && [ "$i" -lt 50 ]; do /usr/bin/sleep 0.1; i=$((i + 1)); done`,
    `read -r pgid start 2>/dev/null < ${pidFile} || exit 0`,
    `case "$pgid" in ''|*[!0-9]*) exit 0;; esac`,
    `case "$start" in ''|*[!0-9]*) /usr/bin/rm -f ${pidFile}; exit 0;; esac`,
    `if read -r s 2>/dev/null < "/proc/$pgid/stat"; then s=\${s##*) }; set -- $s; if [ "\${20}" = "$start" ]; then kill -KILL -- -"$pgid" 2>/dev/null || kill -KILL "$pgid" 2>/dev/null; fi; fi`,
    `/usr/bin/rm -f ${pidFile}`,
  ].join('; ');
}

/** 命令还没派发就被取消：没有运行，按普通失败处理 */
export const EXEC_CANCELLED = '沙箱命令已取消，未执行';

/** 超时 KILL 时 timeout 的退出码 */
export const TIMEOUT_EXIT_CODE = 137;

/** 去掉结尾不完整的 UTF-8 字符（截断点落在多字节字符中间时） */
function trimPartialEnd(buffer: Buffer): Buffer {
  for (let back = 1; back <= Math.min(4, buffer.length); back += 1) {
    const byte = buffer[buffer.length - back];
    if ((byte & 0xc0) === 0x80) continue;
    const length = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return length > back ? buffer.subarray(0, buffer.length - back) : buffer;
  }
  return buffer;
}

/**
 * 捕获一路命令输出，最多保留 maxBytes 字节。
 * 默认只留开头（分页读取等依赖「捕获到的是前缀」）；keepTail 时开头占 1/4、结尾占 3/4，丢弃中间。
 */
export class OutputCollector {
  private readonly head: Buffer[] = [];
  private readonly tail: Buffer[] = [];
  private headBytes = 0;
  private tailBytes = 0;
  private dropped = 0;
  private readonly headLimit: number;

  constructor(
    private readonly maxBytes: number,
    private readonly keepTail = false,
  ) {
    this.headLimit = keepTail ? Math.floor(maxBytes / 4) : maxBytes;
  }

  get truncated(): boolean {
    return this.dropped > 0;
  }

  push(chunk: Buffer | string): void {
    let rest = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    // 留下的字节都复制一份：切片会连带占住调用方那一整块缓冲，实际占用就不受上限约束了
    if (rest.length && this.headBytes < this.headLimit) {
      const part = Buffer.from(rest.subarray(0, this.headLimit - this.headBytes));
      this.head.push(part);
      this.headBytes += part.length;
      rest = rest.subarray(part.length);
    }
    // 结尾窗口装不下的部分直接计入未保留（只留开头时窗口为 0）
    const tailLimit = this.maxBytes - this.headLimit;
    const kept = rest.subarray(Math.max(0, rest.length - tailLimit));
    this.dropped += rest.length - kept.length;
    if (!kept.length) return;
    this.tail.push(Buffer.from(kept));
    this.tailBytes += kept.length;
    while (this.tailBytes > tailLimit) {
      const excess = Math.min(this.tailBytes - tailLimit, this.tail[0].length);
      if (excess === this.tail[0].length) this.tail.shift();
      else this.tail[0] = this.tail[0].subarray(excess);
      this.tailBytes -= excess;
      this.dropped += excess;
    }
  }

  toString(): string {
    if (!this.dropped) return Buffer.concat([...this.head, ...this.tail]).toString('utf8');
    const head = Buffer.concat(this.head);
    if (!this.keepTail)
      return `${head.toString('utf8')}\n…（输出超过 ${this.maxBytes} 字节已截断）`;
    // 两个截断点都对齐到字符边界，舍去的字节计入未保留数
    const kept = trimPartialEnd(head);
    const rest = Buffer.concat(this.tail);
    let skip = 0;
    while (skip < 3 && skip < rest.length && (rest[skip] & 0xc0) === 0x80) skip += 1;
    const omitted = this.dropped + head.length - kept.length + skip;
    return `${kept.toString('utf8')}\n…（输出超过 ${this.maxBytes} 字节，中间 ${omitted} 字节未保留）\n${rest.subarray(skip).toString('utf8')}`;
  }
}

export function newExecId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
