import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  GlobalConfigItem,
  GlobalConfigRegistry,
} from '@/modules/globalConfig/global-config.registry';
import { readSandboxPolicyFromEnv } from '@/modules/sandbox/sandbox.service';
import { parseSandboxPlanPolicies, SANDBOX_PLAN_POLICIES_KEY } from './sandbox/sandbox-plan-policy';

/** 保存沙箱资源档位前校验，并按实例上限检查每一档能否创建；保存规范化后的 JSON */
function validateSandboxPlanPolicies(item: GlobalConfigItem): void {
  if (item.configKey !== SANDBOX_PLAN_POLICIES_KEY) return;
  const raw = typeof item.configVal === 'string' ? item.configVal.trim() : item.configVal;
  if (raw === undefined || raw === null || raw === '') {
    item.configVal = '';
    return;
  }
  try {
    const limits = readSandboxPolicyFromEnv();
    const policies = parseSandboxPlanPolicies(raw, limits);
    item.configVal = JSON.stringify(policies);
  } catch (error) {
    throw new HttpException(
      error instanceof Error ? error.message : '沙箱资源配置无效',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * 商业包向内核配置注册表登记：签到开关与赠送积分需要暴露给用户端；
 * 注册赠送的默认值由内核在启动时按本段声明补齐（不再由内核硬编码）。
 */
@Injectable()
export class CommerceConfigSection {
  constructor(registry: GlobalConfigRegistry) {
    registry.register({
      name: 'commerce',
      frontKeys: ['signInStatus', 'signInCredits'],
      // 支付渠道的私钥 / 密钥：管理端只回显脱敏值，保存时脱敏值视为未修改
      secretKeys: [
        'payWeChatSecret',
        'payWeChatPrivateKey',
        'alipayPrivateKey',
        'payEpayKey',
        'payEpayPrivateKey',
        'stripeSecretKey',
        'stripeWebhookSecret',
        'payPalClientSecret',
      ],
      defaults: [
        { key: 'registerSendStatus', value: '1', public: true },
        { key: 'registerSendCredits', value: '30', public: true },
      ],
      validate: validateSandboxPlanPolicies,
    });
  }
}
