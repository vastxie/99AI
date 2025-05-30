import { Injectable, OnModuleInit } from '@nestjs/common';

// 频率限制配置接口
export interface RateLimitConfig {
  path: string; // 路由路径，支持通配符，如 '/api/user/*'
  maxRequests: number; // 在时间窗口内允许的最大请求数
  windowMs: number; // 时间窗口大小，单位毫秒
}

@Injectable()
export class RateLimitService implements OnModuleInit {
  private configs: RateLimitConfig[] = [];

  constructor() {
    // 在构造函数中初始化配置
    this.initializeConfigs();
  }

  // 实现OnModuleInit接口
  async onModuleInit() {}

  // 初始化配置的方法
  private initializeConfigs() {
    // 添加默认频率限制配置

    // 上传文件路径 - 更严格的限制
    this.addConfig({
      path: '/api/upload/file', // 上传文件路径
      maxRequests: 100, // 每小时最多20次
      windowMs: 60 * 60 * 1000, // 1小时窗口
    });

    // 聊天API限制 - 确保路径格式正确，以斜杠开头
    this.addConfig({
      path: '/api/chatgpt/chat-process', // 聊天API路径（注意开头要有斜杠）
      maxRequests: 1000, // 每小时1000次
      windowMs: 60 * 60 * 1000, // 1小时窗口
    });

    // 支付相关路由 - 更严格的限制
    this.addConfig({
      path: '/api/pay', // 支付相关API
      maxRequests: 600, // 每小时30次
      windowMs: 60 * 60 * 1000, // 1小时窗口
    });

    // 所有API的全局默认配置 (最宽松的限制)
    this.addConfig({
      path: '/api/*', // 所有API
      maxRequests: 3600, // 每小时1000次
      windowMs: 60 * 60 * 1000, // 1小时窗口
    });
  }

  // 获取所有配置
  getConfigs(): RateLimitConfig[] {
    return this.configs;
  }

  // 私有方法，用于初始化和更新配置
  private addConfig(config: RateLimitConfig): void {
    // 确保路径以斜杠开头
    if (config.path && !config.path.startsWith('/')) {
      config.path = `/${config.path}`;
    }

    // 检查是否已存在相同path的配置
    const existingIndex = this.configs.findIndex(c => c.path === config.path);

    if (existingIndex >= 0) {
      // 更新现有配置
      this.configs[existingIndex] = { ...config };
    } else {
      // 添加新配置
      this.configs.push({ ...config });
    }

    // 按路径长度排序，确保更具体的路径优先匹配
    this.sortConfigs();
  }

  // 对配置进行排序，使更具体的路径优先匹配
  private sortConfigs(): void {
    this.configs.sort((a, b) => {
      // 特殊处理通配符
      const aIsWildcard = a.path.includes('*');
      const bIsWildcard = b.path.includes('*');

      if (aIsWildcard && !bIsWildcard) {
        return 1; // 通配符路径排后面
      }

      if (!aIsWildcard && bIsWildcard) {
        return -1; // 非通配符路径排前面
      }

      // 对于同类型的路径，按长度排序（更长的路径更具体）
      return b.path.length - a.path.length;
    });
  }
}
