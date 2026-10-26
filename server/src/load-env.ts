// 先于任何模块装饰器求值加载 .env：各扩展包的 *_PACK_ENABLED 开关在 import 阶段读取。
// dotenv 17 起默认把「injected env」提示打到输出，quiet 关闭它（PM2 会记进错误日志）。
import { config } from 'dotenv';

config({ quiet: true });
