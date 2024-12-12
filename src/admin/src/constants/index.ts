export const USER_STATUS_OPTIONS = [
  { value: 0, label: '待激活' },
  { value: 1, label: '正常' },
  { value: 2, label: '已封禁' },
  { value: 3, label: '黑名单' },
];

export const USER_STATUS_MAP = {
  0: '待激活',
  1: '正常',
  2: '已封禁',
  3: '黑名单',
};

export const USER_STATUS_TYPE_MAP = {
  0: 'info',
  1: 'success',
  2: 'danger',
  3: 'danger',
} as const;

export type UserStatus = keyof typeof USER_STATUS_TYPE_MAP;

// 充值类型map 1: 注册赠送  2: 受邀请赠送  3: 邀请人赠送  4: 购买套餐赠送  5: 管理员赠送 6：扫码支付 7: 绘画失败退款 8: 签到奖励
export const RECHARGE_TYPE_MAP = {
  1: '注册赠送',
  2: '受邀请赠送',
  3: '邀请人赠送',
  4: '购买套餐赠送',
  5: '管理员赠送',
  6: '扫码支付',
  7: '绘画失败退款',
  8: '签到奖励',
};

// 充值数组
export const RECHARGE_TYPE_OPTIONS = [
  { value: 1, label: '注册赠送' },
  { value: 2, label: '受邀请赠送' },
  { value: 3, label: '邀请人赠送' },
  { value: 4, label: '购买套餐赠送' },
  { value: 5, label: '管理员赠送' },
  { value: 6, label: '扫码支付' },
  { value: 7, label: '绘画失败退款' },
  { value: 8, label: '签到奖励' },
];

// 是否开启额外赠送
export const IS_OPTIONS = {
  0: '关闭',
  1: '开启',
};

// 是否开启额外赠送类型
export const IS_TYPE_MAP = {
  0: 'danger',
  1: 'success',
};

export const PACKAGE_TYPE_OPTIONS = [
  { value: 0, label: '禁用' },
  { value: 1, label: '启动' },
];

// 扣费形式 1： 按次数扣费 2：按Token扣费
export const DEDUCTION_TYPE_OPTIONS = [
  { value: 1, label: '按次数扣费' },
  { value: 2, label: '按Token扣费' },
];

// 扣费形式 map
export const DEDUCTION_TYPE_MAP = {
  1: '按次数扣费',
  2: '按Token扣费',
};

export const CRAMI_STATUS_OPTIONS = [
  { value: 0, label: '未使用' },
  { value: 1, label: '已使用' },
];

//  图片推荐状态0未推荐1已推荐
export const RECOMMEND_STATUS_OPTIONS = [
  { value: 0, label: '未推荐' },
  { value: 1, label: '已推荐' },
];

// 0 禁用  1 启用
export const ENABLE_STATUS_OPTIONS = [
  { value: 0, label: '禁用' },
  { value: 1, label: '启用' },
  { value: 3, label: '待审核' },
  { value: 4, label: '拒绝共享' },
  { value: 5, label: '通过共享' },
];

// 问题状态 0 未解决 1 已解决
export const QUESTION_STATUS_OPTIONS = [
  { value: '0', label: '未启用' },
  { value: '1', label: '已启用' },
];

// 问题状态 0 未解决 1 已解决
export const ORDER_STATUS_OPTIONS = [
  { value: 0, label: '待审核' },
  { value: 1, label: '已通过' },
  { value: -1, label: '已拒绝' },
];

//  0：未推荐   1：已推荐  数组
export const RECOMMEND_STATUS = [
  { value: 0, label: '未推荐' },
  { value: 1, label: '已推荐' },
];

// 提现渠道 支付宝 微信
export const WITHDRAW_CHANNEL_OPTIONS = [
  { value: 1, label: '支付宝' },
  { value: 2, label: '微信' },
];

// 1 排队中 2 处理中 3 已完成 4 失败 5 超时
export const WITHDRAW_STATUS_OPTIONS = [
  { value: 1, label: '正在排队' },
  { value: 2, label: '正在绘制' },
  { value: 3, label: '绘制完成' },
  { value: 4, label: '绘制失败' },
  { value: 5, label: '绘制超时' },
];

// 0 禁用 warning 1启用 状态 success
export const ENABLE_STATUS_TYPE_MAP: QuestionStatusMap = {
  0: 'danger',
  1: 'success',
};

interface QuestionStatusMap {
  [key: number]: string;
}

// 问题状态 0 未解决 1 已解决 映射
export const QUESTION_STATUS_MAP: QuestionStatusMap = {
  '-1': '欠费锁定',
  '0': '未启用',
  '1': '已启用',
  '3': '待审核',
  '4': '拒绝共享',
  '5': '通过共享',
};

// 问题状态 0 被封号 1 正常 映射
export const KEY_STATUS_MAP: QuestionStatusMap = {
  0: '被封禁',
  1: '工作中',
};

// 模型列表
export const MODEL_LIST = [
  // GPT-3.5
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-0125',
  'gpt-3.5-turbo-instruct',
  'o1-mini',
  'o1-preview',
  // GPT-4
  'gpt-4',
  'gpt-4o',
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gpt-4o-mini-2024-07-18',
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',
  'gpt-4-all',
  // claude
  'claude-2',
  'claude-3-sonnet-20240229',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20240620',
  // gemini
  'gemini-pro',
  'gemini-pro-vision',
  'gemini-pro-1.5',
  // 百度文心
  'ERNIE-Bot',
  'ERNIE-Bot-4',
  'ERNIE-3.5-8K',
  'ERNIE-Bot-turbo',
  // 阿里通义
  'qwen-turbo',
  'qwen-plus',
  'qwen-max',
  'qwen-max-1201',
  'qwen-max-longcontext',
  // 腾讯混元
  'hunyuan',
  // 清华智谱
  'chatglm_turbo',
  'chatglm_pro',
  'chatglm_std',
  'chatglm_lite',
  'glm-3-turbo',
  'glm-4',
  'glm-4v',
  // 百川智能
  'Baichuan2-53B',
  'Baichuan2-Turbo',
  'Baichuan2-Turbo-192k',
  // 零一万物
  'yi-34b-chat-0205',
  'yi-34b-chat-200k',
  'yi-vl-plus',
  // 360 智脑
  '360GPT_S2_V9',
  // 讯飞星火
  'SparkDesk',
  'SparkDesk-v1.1',
  'SparkDesk-v2.1',
  'SparkDesk-v3.1',
  'SparkDesk-v3.5',
  // deepseek
  'deepseek-chat',
  'deepseek-coder',
  // moonshot
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
  // DALL-E
  'dall-e-3',
  // Midjourney
  'midjourney',
  // 特殊模型
  'luma-video',
  'flux-draw',
  'cog-video',
  'tts-1',
  'gpts',
  'stable-diffusion',
  'suno-music',
];

// 模型列表 0 mj   1 Dall-e
export const DRAW_MODEL_LIST = [
  { value: 'midjourney', label: 'Midjourney' },
  { value: 'stable-diffusion', label: 'Stable-Diffusion' },
  { value: 'dall-e-3', label: 'Dall-e-3' },
];
// 支付状态列表  status 0：未支付、1：已支付、2、支付失败、3：支付超时
export const PAY_STATUS_OPTIONS = [
  { value: 0, label: '未支付' },
  { value: 1, label: '已支付' },
  { value: 2, label: '支付失败' },
  { value: 3, label: '支付超时' },
];

//  支付状态  status 0：未支付、1：已支付、2、支付失败、3：支付超时
export const PAY_STATUS_MAP: QuestionStatusMap = {
  0: '未支付',
  1: '已支付',
  2: '支付失败',
  3: '支付超时',
};

// 平台列表 epay: 易支付  hupi：虎皮椒 ltzf：蓝兔支付
export const PAY_PLATFORM_LIST = [
  { value: 'epay', label: '易支付' },
  { value: 'hupi', label: '虎皮椒' },
  { value: 'wechat', label: '微信支付' },
  { value: 'mpay', label: '码支付' },
  { value: 'ltzf', label: '蓝兔支付' },
];

// 支付对应
export const PAY_PLATFORM_MAP = {
  epay: '易支付',
  hupi: '虎皮椒',
  wechat: '微信支付',
  mpay: '码支付',
  ltzf: '蓝兔支付',
};

//  绘画状态  1: 等待中 2: 绘制中 3: 绘制完成 4: 绘制失败 5: 绘制超时
export const DRAW_MJ_STATUS_LIST = [
  { value: 1, label: '等待中' },
  { value: 2, label: '绘制中' },
  { value: 3, label: '绘制完成' },
  { value: 4, label: '绘制失败' },
  { value: 5, label: '绘制超时' },
];

// App角色 系统 system  用户 user
export const APP_ROLE_LIST = [
  { value: 'system', label: '系统' },
  { value: 'user', label: '用户' },
];

// 绘画状态 1：排队中 2：绘制中 3：绘制完成 4：绘制失败 5：绘制超时
export const DRAW_STATUS_MAP = {
  1: '排队中',
  2: '绘制中',
  3: '绘制完成',
  4: '绘制失败',
  5: '绘制超时',
};

export const TYPEORIGINLIST = [
  { value: '百度云检测', label: '百度云检测' },
  { value: '自定义检测', label: '自定义检测' },
];

export const MODELTYPELIST = [
  { value: 1, label: '基础对话' },
  { value: 2, label: '创意模型' },
  { value: 3, label: '特殊模型' },
];

export const MODELTYPEMAP = {
  1: '基础对话',
  2: '创意模型',
  3: '特殊模型',
};

export const MODELSMAPLIST = {
  1: [
    // GPT-3.5
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-1106',
    'gpt-3.5-turbo-0125',
    'gpt-3.5-turbo-instruct',
    'o1-mini',
    'o1-preview',
    // GPT-4
    'gpt-4',
    'gpt-4o',
    'gpt-4o-2024-05-13',
    'gpt-4o-2024-08-06',
    'gpt-4o-mini',
    'gpt-4o-mini-2024-07-18',
    'gpt-4o-mini-2024-07-18',
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4-all',
    // claude
    'claude-2',
    'claude-3-sonnet-20240229',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
    'claude-3-5-sonnet-20240620',
    // gemini
    'gemini-pro',
    'gemini-pro-vision',
    'gemini-pro-1.5',
    // 百度文心
    'ERNIE-Bot',
    'ERNIE-Bot-4',
    'ERNIE-3.5-8K',
    'ERNIE-Bot-turbo',
    // 阿里通义
    'qwen-turbo',
    'qwen-plus',
    'qwen-max',
    'qwen-max-1201',
    'qwen-max-longcontext',
    // 腾讯混元
    'hunyuan',
    // 清华智谱
    'chatglm_turbo',
    'chatglm_pro',
    'chatglm_std',
    'chatglm_lite',
    'glm-3-turbo',
    'glm-4',
    'glm-4v',
    // 百川智能
    'Baichuan2-53B',
    'Baichuan2-Turbo',
    'Baichuan2-Turbo-192k',
    // 零一万物
    'yi-34b-chat-0205',
    'yi-34b-chat-200k',
    'yi-vl-plus',
    // 360 智脑
    '360GPT_S2_V9',
    // 讯飞星火
    'SparkDesk',
    'SparkDesk-v1.1',
    'SparkDesk-v2.1',
    'SparkDesk-v3.1',
    'SparkDesk-v3.5',
    // deepseek
    'deepseek-chat',
    'deepseek-coder',
    // moonshot
    'moonshot-v1-8k',
    'moonshot-v1-32k',
    'moonshot-v1-128k',
  ],
  2: [
    'dall-e-3',
    'midjourney',
    'stable-diffusion',
    'suno-music',
    'luma-video',
    'flux-draw',
    'cog-video',
  ],
  3: ['tts-1', 'gpts'],
};

/* 扣费类型  普通余额还是高级余额 */
export const DEDUCTTYPELIST = [
  { value: 1, label: '普通积分' },
  { value: 2, label: '高级积分' },
  { value: 3, label: '绘画积分' },
];
