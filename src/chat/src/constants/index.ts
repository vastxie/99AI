import { t } from '@/locales'; // Ensure you have a function t for translation lookup

interface RechargeType {
  [key: number]: string
}

export const RechargeTypeMap: RechargeType = {
  1: t('rechargeTypes.1'),
  2: t('rechargeTypes.2'),
  3: t('rechargeTypes.3'),
  4: t('rechargeTypes.4'),
  5: t('rechargeTypes.5'),
  6: t('rechargeTypes.6'),
  7: t('rechargeTypes.7'),
  8: t('rechargeTypes.8'),
}

export const OrderMap = {
  0: t('orderStatus.0'),
  1: t('orderStatus.1'),
  2: t('orderStatus.2'),
  3: t('orderStatus.3'),
}
