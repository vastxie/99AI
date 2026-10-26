// 冒烟测试中模拟模型与冒烟脚本共用的约定值
export const SMOKE_FINAL_TEXT = 'SMOKE_TURN_DONE';
export const SMOKE_TITLE_TEXT = 'Smoke conversation';
export const SMOKE_NO_BASH_TEXT = 'SMOKE_ERROR_NO_BASH_TOOL';
export const SMOKE_ARTIFACT_NAME = 'smoke.txt';
export const SMOKE_ARTIFACT_CONTENT = 'smoke-artifact-ok\n';
// 顺带输出内核版本：gVisor 下为 *-gvisor，冒烟脚本可据此确认工具确实跑在 runsc 里；
// 再输出两个代理例外变量：Docker 驱动给每条命令下发回环例外，冒烟脚本可据此确认变量确实到了容器里
export const SMOKE_TOOL_COMMAND = `printf "smoke-artifact-ok\\n" > "$AGENT_OUTPUT_DIR/${SMOKE_ARTIFACT_NAME}" && uname -r && echo "NO_PROXY=$NO_PROXY" && echo "no_proxy=$no_proxy"`;

// 浏览器用例的剧本标记：最后一条用户消息带标记时，模拟模型不调工具，按对应剧本回复
export const MOCK_SLOW_MARKER = '[mock:slow]';
export const MOCK_TABLE_MARKER = '[mock:table]';
// 慢速剧本：分段流出，留出点「停止」和断网重连的时间
export const MOCK_SLOW_SEGMENTS = 40;
export const MOCK_SLOW_INTERVAL_MS = 150;
export const MOCK_SLOW_FINAL_TEXT = 'SLOW_STREAM_DONE';
// 表格剧本：两张表。第一张是常见的三列（两列短、一列长），窄屏上应当完整放进一屏；
// 第二张五列，放不下，应当整张表横向滚动，而不是把短的列挤成一字一行
export const MOCK_TABLE_TEXT = [
  '| 功能 | 说明 | 状态 |',
  '| --- | --- | --- |',
  '| 多用户 | 每个登录用户拥有一台自己的沙箱电脑，多个对话共用，可以同时执行任务 | 已上线 |',
  '| 文件交付 | 生成的文件、装过的软件和设置都会保留，删除对话也不会删除目录 | 已上线 |',
  '| 扩展包 | 登录、支付、内容安全、微信渠道都可以按需装载或裁剪 | 持续完善 |',
  '',
  '| 套餐 | 沙箱内存 | 磁盘空间 | 适合场景 | 备注 |',
  '| --- | --- | --- | --- | --- |',
  '| 基础版 | 一千兆 | 两千兆 | 日常问答与轻量的文件处理 | 默认档位 |',
  '| 专业版 | 三千兆 | 一万六千兆 | 数据分析、批量文档和较大的代码项目 | 可以随时调整 |',
].join('\n');
