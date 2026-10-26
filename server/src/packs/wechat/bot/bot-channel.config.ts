export enum BotChannel {
  WEIXIN = 'weixin',
  TELEGRAM = 'telegram',
  DISCORD = 'discord',
}

interface BotChannelCapability {
  name: string;
  receiveMode: 'polling' | 'webhook';
  supportsTyping: boolean;
  supportsMedia: boolean;
  maxMessageLength: number;
  needConfig: string[];
  disabled?: boolean;
}

export const BOT_CHANNEL_CAPABILITIES: Record<BotChannel, BotChannelCapability> = {
  [BotChannel.WEIXIN]: {
    name: '微信Bot',
    receiveMode: 'polling',
    supportsTyping: true,
    supportsMedia: true,
    maxMessageLength: 3000,
    needConfig: ['weixinBotStatus'],
  },
  [BotChannel.TELEGRAM]: {
    name: 'Telegram Bot',
    receiveMode: 'webhook',
    supportsTyping: true,
    supportsMedia: true,
    maxMessageLength: 4096,
    needConfig: ['telegramBotToken'],
    disabled: true,
  },
  [BotChannel.DISCORD]: {
    name: 'Discord Bot',
    receiveMode: 'webhook',
    supportsTyping: true,
    supportsMedia: true,
    maxMessageLength: 2000,
    needConfig: ['discordBotToken'],
    disabled: true,
  },
};
