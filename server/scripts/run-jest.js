const { spawnSync } = require('child_process');

// NestJS 12、raw-body 4 等依赖是纯 ESM。Jest 30 只有在 --experimental-vm-modules 下
// 才会在自己的模块注册表里支持 require(esm)，且需要 Node >= 24.9 的 vm 能力。
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 9)) {
  console.error(
    `运行 server 测试需要 Node >= 24.9（当前 ${process.version}）：Jest 加载纯 ESM 依赖要用到该版本的 vm 模块能力`,
  );
  process.exit(1);
}

// ESM 模式下 Jest 不回收每个测试文件加载的 ESM 模块，单进程串行（--runInBand）时堆内存随文件数线性增长。
// 改为「单个工作进程 + workerIdleMemoryLimit（见 package.json）」：仍然逐个文件串行，但内存超限后换新进程。
const args = process.argv
  .slice(2)
  .filter(arg => arg !== '--')
  .map(arg => (arg === '--runInBand' || arg === '-i' ? '--maxWorkers=1' : arg));
const result = spawnSync(
  process.execPath,
  [
    '--experimental-vm-modules',
    '--disable-warning=ExperimentalWarning',
    require.resolve('jest/bin/jest'),
    ...args,
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
