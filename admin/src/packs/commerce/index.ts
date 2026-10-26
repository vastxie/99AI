import type { RouteRecordRaw } from 'vue-router';
import { defineAdminPack } from '@/core/packs/defineAdminPack';
import { packEnabled } from '@/utils/packs';
import { formatDateTime } from '@/utils/format';
import manifest from './pack.json';
import paymentGroup from './nav-group';

/**
 * 商业包（管理端）：套餐 / 订单 / 支付配置 / 支付参数 / 积分调整 / 订单统计，
 * 以及用户管理列表的额度列与操作、用户详情的「权益与消费」页签（含账户明细）、用户策略的赠送卡片。
 * VITE_COMMERCE_ENABLED=false 时整包不装载（对应后端 COMMERCE_PACK_ENABLED）。
 */
export const COMMERCE_ENABLED = packEnabled(import.meta.env.VITE_COMMERCE_ENABLED);

/** 侧栏分组「支付财务」 */
export const commerceNavGroups: RouteRecordRaw[] = COMMERCE_ENABLED ? [paymentGroup] : [];

/**
 * 账户明细已并入用户详情的「权益与消费」页签；这条隐藏路由只为兼容旧链接
 * （服务端 profile 里的 /user/account-log?userId= 与历史书签）做跳转。
 */
export const commerceUserPages: RouteRecordRaw[] = [
  {
    path: 'account-log',
    name: 'AccountLog',
    component: () => import('./views/accountLog.vue'),
    meta: {
      title: '账户明细',
      icon: 'i-lucide:coins',
      hidden: true,
      activeNav: '/user/dashboard',
    },
  },
];

function billingField(row: any, field: string) {
  return row?.billing?.[field];
}

export default defineAdminPack({
  id: manifest.id,
  tier: 'feature',
  enabled: COMMERCE_ENABLED,
  navGroups: commerceNavGroups,
  navPages: { UserGroup: commerceUserPages },
  userListColumns: [
    { prop: 'billing.credits', label: '积分余额', width: 110, align: 'right' },
    { prop: 'billing.memberCredits', label: '会员积分', width: 110, align: 'right' },
    {
      prop: 'billing.expirationTime',
      label: '会员到期时间',
      width: 170,
      formatter: (row) => {
        const expirationTime = billingField(row, 'expirationTime');
        return formatDateTime(expirationTime);
      },
    },
    { prop: 'billing.usedCredits', label: '已用积分', width: 110, align: 'right' },
    { prop: 'billing.usedTokens', label: '已用 Token', width: 120, align: 'right' },
  ],
  userListActions: [
    { id: 'commerce.user-list-actions', component: () => import('./user/UserListActions.vue') },
  ],
  userDetailSections: [
    {
      id: 'commerce',
      title: '权益与消费',
      component: () => import('./user/UserProfileSection.vue'),
    },
  ],
  userPolicyCards: [
    { id: 'commerce.user-policy', component: () => import('./user/UserPolicyCard.vue') },
  ],
});
