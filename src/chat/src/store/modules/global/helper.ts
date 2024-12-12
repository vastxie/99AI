import { ss } from '@/utils/storage';
import { UserState } from '../users/helper';

const LOCAL_NAME = 'userStorage';

export interface UserInfo {
  avatar: string;
  name: string;
}

export interface OrderInfo {
  pkgInfo: {
    id: number;
    des: string;
    name: string;
    price: string;
    model3Count: number;
    model4Count: number;
    drawMjCount: number;
    coverImg: string;
    days: number;
  };
}

export interface GlobalState {
  payDialog: boolean;
  goodsDialog: boolean;
  fingerprint: number;
  noticeDialog: boolean;
  bindWxDialog: boolean;
  signInDialog: boolean;
  appDialog: boolean;
  identityDialog: boolean;
  phoneIdentityDialog: boolean;
  userAgreementDialog: boolean;
  BadWordsDialog: boolean;
  // modelDialog: boolean
  isChatIn: boolean;
  orderInfo: OrderInfo;
  model: number;
  iframeUrl: string;
  clipboardText: string;
}

export function defaultSetting(): UserState {
  return {
    userInfo: {
      avatar:
        'https://public-1300678944.cos.ap-shanghai.myqcloud.com/blog/1681310872890image.png',
      name: '未登录',
    },
  };
}

export function getLocalState(): UserState {
  const localSetting: UserState | undefined = ss.get(LOCAL_NAME);
  return { ...defaultSetting(), ...localSetting };
}

export function setLocalState(setting: UserState): void {
  ss.set(LOCAL_NAME, setting);
}
