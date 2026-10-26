import { isDevelopmentRuntime } from '../utils/runtime-env.util';

/**
 * 认证相关配置
 */
export const AuthConfig = {
  // JWT 配置
  jwt: {
    expiresIn: '30d' as const, // Token 有效期 30天
    refreshExpiresIn: '60d' as const, // 刷新Token有效期 60天
    algorithm: 'HS256' as const,
  },

  // 设备限制配置
  device: {
    maxDevices: 3, // 最大设备数默认限制为3个（动态配置可在管理端修改）
    // 登录用户（含 super）必须校验 Redis 会话状态；访客走独立 visitor session 校验。
    checkWhitelistRoles: [] as string[], // 白名单角色，跳过 Redis 会话检查
  },

  // Redis 配置
  redis: {
    tokenPrefix: 'tokens:', // 用户token集合前缀
    tokenDataPrefix: 'token:data:', // token数据前缀
    refreshTokenPrefix: 'refresh:token:', // 刷新token前缀
    tokenTTL: 30 * 24 * 60 * 60, // Token在Redis中的TTL：30天（秒）
    refreshTokenTTL: 60 * 24 * 60 * 60, // 刷新Token在Redis中的TTL：60天（秒）
    visitorSessionTTL: 7 * 24 * 60 * 60, // 游客会话在Redis中的TTL：7天（秒），到期后客户端重新签发
  },

  // 密码加密配置
  bcrypt: {
    // 未显式声明开发 / 测试环境时按生产强度处理（10 轮），只有 NODE_ENV=development/test 或 ISDEV=true 才降到 5 轮
    rounds: isDevelopmentRuntime() ? 5 : 10,
  },

  // 权限缓存配置
  cache: {
    permissionCacheTTL: 5 * 60 * 1000, // 权限缓存时间：5分钟（毫秒）
    jwtSecretCacheTTL: 60 * 60 * 1000, // JWT密钥缓存时间：1小时（毫秒）
  },

  // 验证码配置
  verification: {
    codeTTL: 5 * 60, // 验证码有效期：5分钟（秒）
    codeLength: 6, // 验证码长度
    maxAttempts: 5, // 最大尝试次数
    cooldown: 60, // 发送间隔：60秒
  },

  // 登录配置：同一账号连续失败 maxLoginAttempts 次后锁定 lockoutDuration 秒；同一 IP 在窗口内失败 maxLoginAttemptsPerIp 次后同样锁定
  login: {
    maxLoginAttempts: 5, // 单账号最大连续失败次数
    maxLoginAttemptsPerIp: 50, // 单 IP 在锁定窗口内的最大失败次数
    lockoutDuration: 15 * 60, // 锁定时长：15分钟（秒）
  },

  // 游客会话签发限制：同一 IP 每小时最多签发的游客会话数
  visitor: {
    sessionsPerIpPerHour: 30,
  },
};
