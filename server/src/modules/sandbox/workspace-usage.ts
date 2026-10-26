import type { SandboxResourceUsage } from './sandbox.port';

/** 固定解释器以隔离模式执行；不跟随符号链接、不加载工作区模块，遍历数量受限。 */
export const WORKSPACE_USAGE_SCRIPT = `
import os, sys, stat, json
root = '/workspace'
limit = int(sys.argv[1])
seen = set()
stack = [root]
size = 0
complete = True
while stack:
    item = stack.pop()
    s = os.lstat(item)
    key = (s.st_dev, s.st_ino)
    if key in seen:
        continue
    seen.add(key)
    size += max(s.st_size, s.st_blocks * 512)
    if len(seen) > limit:
        complete = False
        break
    if stat.S_ISDIR(s.st_mode):
        with os.scandir(item) as entries:
            for entry in entries:
                stack.append(entry.path)
                if len(stack) + len(seen) > limit + 1:
                    complete = False
                    break
        if not complete:
            break
v = os.statvfs(root)
print(json.dumps(dict(workspaceBytes=size, workspaceInodes=len(seen), freeBytes=v.f_bavail*v.f_frsize, freeInodes=v.f_favail, scanComplete=complete)))
`;

export function parseWorkspaceUsage(value: string): SandboxResourceUsage {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object') throw new Error('沙箱容量观测失败');
  const record = parsed as Record<string, unknown>;
  for (const key of ['workspaceBytes', 'workspaceInodes', 'freeBytes', 'freeInodes']) {
    if (!Number.isSafeInteger(record[key]) || Number(record[key]) < 0) {
      throw new Error('沙箱容量观测失败');
    }
  }
  if (typeof record.scanComplete !== 'boolean') throw new Error('沙箱容量观测失败');
  return {
    workspaceBytes: Number(record.workspaceBytes),
    workspaceInodes: Number(record.workspaceInodes),
    freeBytes: Number(record.freeBytes),
    freeInodes: Number(record.freeInodes),
    scanComplete: record.scanComplete,
  };
}
