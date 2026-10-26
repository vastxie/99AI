import { createHash } from 'node:crypto';
import { resolveWorkspacePath, SandboxOperationError } from '../../sandbox/sandbox.port';

export const SKILL_PACKAGE_MAX_BYTES = 2 * 1024 * 1024;
export const SKILL_PACKAGE_MAX_FILES = 100;
export function skillName(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(value))
    throw new SandboxOperationError('技能名称仅允许字母、数字、下划线和连字符，最长 64 字符');
  return value;
}
export function skillSourcePath(value: string): string {
  const normalized = resolveWorkspacePath(value);
  if (
    value !== normalized ||
    value.split('/').length > 8 ||
    value.length > 240 ||
    value
      .split('/')
      .some(
        part =>
          part.startsWith('.') ||
          /^(node_modules|venv|env|__pycache__|in|out|pending|artifacts)$/iu.test(part),
      ) ||
    !/\.(md|py|js|mjs|cjs|ts|sh|json|yaml|yml|toml|lock|txt)$/iu.test(value) ||
    /(credential|secret|password|token|private[-_]?key)/iu.test(value)
  )
    throw new SandboxOperationError('技能包只接受有界源码和依赖说明，不包含缓存、凭据或任务目录');
  return normalized;
}
export interface SkillSourceFile {
  path: string;
  content: string;
  sha256: string;
}
export function encodeSkillPackage(name: string, files: SkillSourceFile[]): Buffer {
  const buffer = Buffer.from(JSON.stringify({ schema: 1, name: skillName(name), files }));
  decodeSkillPackage(buffer);
  return buffer;
}
export function decodeSkillPackage(buffer: Buffer): {
  name: string;
  files: Array<{ path: string; buffer: Buffer }>;
} {
  if (buffer.length > SKILL_PACKAGE_MAX_BYTES * 1.5)
    throw new SandboxOperationError('技能包超过大小限制');
  const data = JSON.parse(buffer.toString('utf8'));
  if (
    data?.schema !== 1 ||
    !Array.isArray(data.files) ||
    data.files.length > SKILL_PACKAGE_MAX_FILES
  )
    throw new SandboxOperationError('技能包格式无效');
  const seen = new Set<string>();
  let total = 0;
  const files = data.files.map((file: SkillSourceFile) => {
    const path = skillSourcePath(file.path);
    if (seen.has(path) || typeof file.content !== 'string')
      throw new SandboxOperationError('技能包文件重复或格式无效');
    seen.add(path);
    const content = Buffer.from(file.content, 'base64');
    total += content.length;
    if (
      content.toString('base64') !== file.content ||
      content.length > 256 * 1024 ||
      total > SKILL_PACKAGE_MAX_BYTES ||
      createHash('sha256').update(content).digest('hex') !== file.sha256
    )
      throw new SandboxOperationError('技能包内容校验失败');
    return { path, buffer: content };
  });
  if (!seen.has('SKILL.md')) throw new SandboxOperationError('技能包必须包含 SKILL.md');
  return { name: skillName(data.name), files };
}
/** 清单包含内容摘要；读取后再校验，拒绝扫描后发生的内容替换。 */
export const SKILL_MANIFEST_SCRIPT = `
import os,sys,stat,json,hashlib
root='/workspace/skills/'+sys.argv[1]
if os.path.islink(root): raise ValueError('symlink')
files=[]; total=0
for directory,dirs,names in os.walk(root,followlinks=False):
    if os.path.islink(directory): raise ValueError('symlink')
    dirs[:]=[d for d in dirs if d not in ('.git','node_modules','venv','.venv','__pycache__','.cache')]
    for name in dirs:
        if os.path.islink(os.path.join(directory,name)): raise ValueError('symlink')
    if len(directory.split('/'))>12: raise ValueError('depth')
    for name in names:
        target=os.path.join(directory,name); st=os.lstat(target)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1: raise ValueError('not ordinary file')
        total+=st.st_size
        if total>2097152 or st.st_size>262144 or len(files)>=100: raise ValueError('limit')
        with open(target,'rb') as f: content=f.read(262145)
        if len(content)>262144: raise ValueError('limit')
        files.append(dict(path=os.path.relpath(target,root),sha256=hashlib.sha256(content).hexdigest()))
print(json.dumps(files))
`;
