declare namespace Chat {
  interface Chat {
    chatId?: number;
    text: string;
    modelType?: number;
    status?: number;
    fileInfo?: string;
    model?: string;
    modelName?: string;
    inversion?: boolean;
    ttsUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    action?: string;
    drawId?: string;
    customId?: string;
    usage?: object;
    error?: boolean;
    loading?: boolean;
    usingPlugin?: string;
    modelAvatar?: string;
    taskData?: any;
    conversationOptions?: ConversationRequest | null;
    pluginParam?: string;
    promptReference?: string;
  }

  interface History {
    title: string;
    isEdit: boolean;
    uuid: number;
    isSticky: boolean;
    config: string;
  }

  interface ChatState {
    active: number;
    usingContext: boolean;
    usingNetwork: boolean;
    history?: History[];
    baseConfig: any;
    chat?: { uuid: number; data: Chat[] }[];
    groupList: {
      uuid: number;
      title: string;
      appId: number;
      isEdit: boolean;
      isSticky: boolean;
      config: string;
      createdAt: Date;
      updatedAt: Date;
      appLogo?: string;
      fileUrl?: string;
    }[];
    chatList: Chat[];
    groupKeyWord?: string;
    activeConfig?: any;
    activeModel?: string;
    activeModelName?: string;
    activeGroupFileUrl?: string;
    activeModelType?: number;
    activeModelAvatar?: string;
    activeModelFileUpload?: number;
    activeModelDeductType?: number;
    activeModelPrice?: number;
    activeGroupAppId?: number;
    isStreamIn?: boolean;
    pluginList: [];
    prompt?: string;
    currentPlugin?: {
      // 可选，存储当前使用的插件信息
      pluginId: number;
      pluginName: string;
      description: string;
      pluginImg: string;
      parameters: string;
      deductType: number;
    };
  }

  interface ConversationRequest {
    conversationId?: string;
    parentMessageId?: string;
    temperature?: number;
    model?: number;
    modelType?: number;
    groupId?: number;
  }

  interface ConversationParams {
    msg: string;
    action?: string;
    drawId?: string;
    customId?: string;
    model?: string;
    modelName?: string;
    modelType?: number;
    modelAvatar?: string;
    usingPlugin?: any;
    appId?: number;
    extraParam?: any;
    fileUrl?: string;
    chatId?: number;
  }

  interface SearchAppsResponse {}

  interface ConversationResponse {
    conversationId: string;
    detail: {
      choices: {
        finish_reason: string;
        index: number;
        logprobs: any;
        text: string;
      }[];
      created: number;
      id: string;
      model: string;
      object: string;
      usage: {
        completion_tokens: number;
        prompt_tokens: number;
        total_tokens: number;
      };
    };
    id: string;
    parentMessageId: string;
    role: string;
    text: string;
  }
}
