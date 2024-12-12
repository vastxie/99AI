import {
  fetchCreateGroupAPI,
  fetchDelAllGroupAPI,
  fetchDelGroupAPI,
  fetchQueryGroupAPI,
  fetchUpdateGroupAPI,
} from '@/api/group';
import { defineStore } from 'pinia';
import { getLocalState, setLocalState } from './helper';

import {
  fetchDelChatLogAPI,
  fetchDelChatLogByGroupIdAPI,
  fetchDeleteGroupChatsAfterIdAPI,
  fetchQueryChatLogListAPI,
} from '@/api/chatLog';
import { fetchModelBaseConfigAPI } from '@/api/models';
import { fetchQueryPluginsAPI } from '@/api/plugin';

export const useChatStore = defineStore('chat-store', {
  state: (): Chat.ChatState => getLocalState(),

  getters: {
    /* 当前选用模型的配置 */
    activeConfig: (state) => {
      const uuid = state.active;
      if (!uuid) return {};
      const config = state.groupList.find((item) => item.uuid === uuid)?.config;
      const parsedConfig = config ? JSON.parse(config) : state.baseConfig;

      return parsedConfig;
    },

    activeGroupAppId: (state) => {
      const uuid = state.active;
      if (!uuid) return null;
      return state.groupList.find((item) => item.uuid === uuid)?.appId;
    },

    activeGroupFileUrl: (state) => {
      const uuid = state.active;
      if (!uuid) return null;
      return state.groupList.find((item) => item.uuid === uuid)?.fileUrl;
    },

    /* 当前选用模型的名称 */
    activeModel(state) {
      return this.activeConfig?.modelInfo?.model;
    },

    /* 当前选用模型的名称 */
    activeModelName(state) {
      return this.activeConfig?.modelInfo?.modelName;
    },

    /* 当前选用模型的名称 */
    activeModelAvatar(state) {
      return this.activeConfig?.modelInfo?.modelAvatar;
    },

    /* 当前选用模型的扣费类型 */
    activeModelDeductType(state) {
      return this.activeConfig?.modelInfo?.deductType;
    },

    /* 当前选用模型的模型类型 */
    activeModelKeyType(state) {
      return this.activeConfig?.modelInfo?.keyType;
    },

    /* 当前选用模型支持上传文件的格式 */
    activeModelFileUpload(state) {
      return this.activeConfig?.modelInfo?.isFileUpload;
    },

    /* 当前选用模型的调用价格 */
    activeModelPrice(state) {
      return this.activeConfig?.modelInfo?.deduct;
    },
  },

  actions: {
    /* 查询插件列表 */
    async queryPlugins() {
      try {
        const res: any = await fetchQueryPluginsAPI();
        if (res.success && res.code === 200) {
          // 过滤掉不启用的插件并只保留需要的字段
          this.pluginList = res.data.rows
            .filter((plugin: any) => plugin.isEnabled === 1)
            .map((plugin: any) => ({
              pluginId: plugin.id,
              pluginName: plugin.name,
              description: plugin.description,
              pluginImg: plugin.pluginImg,
              parameters: plugin.parameters,
              deductType: plugin.deductType,
            }));
        } else {
        }
      } catch (error) {}
    },

    /* 对话组过滤 */
    setGroupKeyWord(keyWord: string) {
      this.groupKeyWord = keyWord;
    },

    /* 计算拿到当前选择的对话组信息 */
    getChatByGroupInfo() {
      if (this.active)
        return this.groupList.find((item) => item.uuid === this.active);
    },

    /*  */
    getConfigFromUuid(uuid: any) {
      return this.groupList.find((item) => item.uuid === uuid)?.config;
    },

    /* 新增新的对话组 */
    async addNewChatGroup(appId = 0, modelConfig?: any, params?: string) {
      try {
        const res: any = await fetchCreateGroupAPI({
          appId,
          modelConfig,
          params,
        });
        this.active = res.data.id;
        await this.queryMyGroup();
        await this.setActiveGroup(res.data.id);
      } catch (error) {
        console.error('新增对话组时出错:', error);
      }
    },

    /* 查询基础模型配置  */
    async getBaseModelConfig() {
      const res = await fetchModelBaseConfigAPI();
      this.baseConfig = res?.data;
    },

    /* 查询我的对话组 */
    async queryMyGroup() {
      const res: any = await fetchQueryGroupAPI();
      this.groupList = [
        ...res.data.map((item: any) => {
          const {
            id: uuid,
            title,
            isSticky,
            createdAt,
            updatedAt,
            appId,
            config,
            appLogo,
            isFixedModel,
            isGpts,
            params,
            fileUrl,
          } = item;
          return {
            uuid,
            title,
            isEdit: false,
            appId,
            config,
            isSticky,
            appLogo,
            createdAt,
            isFixedModel,
            isGpts,
            params,
            fileUrl,
            updatedAt: new Date(updatedAt).getTime(),
          };
        }),
      ];

      const isHasActive = this.groupList.some(
        (item: { uuid: any }) => Number(item.uuid) === Number(this.active)
      );
      if (!this.active || !isHasActive) {
        this.groupList.length && this.setActiveGroup(this.groupList[0].uuid);
      }
      // 如果 groupList 为空，新建一个对话组
      if (this.groupList.length === 0) {
        await this.addNewChatGroup();
      }
      this.recordState();
    },

    /* 修改对话组信息 */
    async updateGroupInfo(params: {
      groupId: number;
      title?: string;
      isSticky?: boolean;
      fileUrl?: string;
    }) {
      await fetchUpdateGroupAPI(params);
      await this.queryMyGroup();
    },

    /* 变更对话组 */
    // 设置当前激活的对话组
    async setActiveGroup(uuid: number) {
      // this.chatList = [];
      // 将当前激活的对话组ID设置为传入的uuid
      this.active = uuid;

      // 如果当前有激活的对话组，则查询该对话组的聊天记录列表

      // 将所有对话组的编辑状态设置为false
      this.groupList.forEach((item) => (item.isEdit = false));

      if (this.active) {
        await this.queryActiveChatLogList();
      } else {
        this.chatList = [];
      }
      // 记录当前状态
      this.recordState();
    },

    /* 删除对话组 */
    async deleteGroup(params: Chat.History) {
      const curIndex = this.groupList.findIndex(
        (item) => item.uuid === params.uuid
      );
      const { uuid: groupId } = params;
      await fetchDelGroupAPI({ groupId });
      await this.queryMyGroup();
      if (this.groupList.length === 0) await this.setActiveGroup(0);

      if (curIndex > 0 && curIndex < this.groupList.length)
        await this.setActiveGroup(this.groupList[curIndex].uuid);

      if (curIndex === 0 && this.groupList.length > 0)
        await this.setActiveGroup(this.groupList[0].uuid);

      if (
        curIndex > this.groupList.length ||
        (curIndex === 0 && this.groupList.length === 0)
      )
        await this.setActiveGroup(0);

      if (curIndex > 0 && curIndex === this.groupList.length)
        await this.setActiveGroup(this.groupList[curIndex - 1].uuid);

      this.recordState();
    },

    /* 删除全部非置顶对话组 */
    async delAllGroup() {
      if (!this.active || !this.groupList.length) return;
      await fetchDelAllGroupAPI();
      await this.queryMyGroup();
      if (this.groupList.length === 0) await this.setActiveGroup(0);
      else await this.setActiveGroup(this.groupList[0].uuid);
    },

    // /* 查询当前对话组的聊天记录 */
    // async queryActiveChatLogList() {
    //   if (!this.active || Number(this.active) === 0) return;
    //   const res: any = await fetchQueryChatLogListAPI({ groupId: this.active });
    //   this.chatList = res.data;
    //   this.recordState();
    // },

    /* 查询当前对话组的聊天记录 */
    async queryActiveChatLogList() {
      if (!this.active || Number(this.active) === 0) return;
      try {
        const res: any = await fetchQueryChatLogListAPI({
          groupId: this.active,
        });
        if (res && res.data) {
          this.chatList = res.data;
        } else {
          this.chatList = [];
        }
      } catch (error) {
        console.error('Error fetching chat log list:', error);
        this.chatList = [];
      }
      this.recordState();
    },

    /* 添加一条虚拟的对话记录 */
    addGroupChat(data: Chat.Chat) {
      this.chatList = [...this.chatList, data];
    },

    /* 动态修改对话记录 */
    updateGroupChat(index: number, data: Chat.Chat) {
      this.chatList[index] = { ...this.chatList[index], ...data };
    },

    /* 修改其中部分内容 */
    updateGroupChatSome(index: number, data: Partial<Chat.Chat>) {
      this.chatList[index] = { ...this.chatList[index], ...data };
    },

    /* 删除一条对话记录 */
    async deleteChatById(chatId: number | undefined) {
      if (!chatId) return;
      await fetchDelChatLogAPI({ id: chatId });
      await this.queryActiveChatLogList();
    },

    /* 删除一条对话记录 */
    async deleteChatsAfterId(chatId: number | undefined) {
      if (!chatId) return;
      await fetchDeleteGroupChatsAfterIdAPI({ id: chatId });
      await this.queryActiveChatLogList();
    },

    /* 设置使用上下文 */
    setUsingContext(context: boolean) {
      this.usingContext = context;
      this.recordState();
    },

    /* 设置使用联网 */
    setUsingNetwork(context: boolean) {
      this.usingNetwork = context;
      this.recordState();
    },

    setUsingPlugin(plugin: any) {
      // Set the current plugin to the new plugin if provided, else clear it
      this.currentPlugin = plugin || undefined;
      this.recordState(); // Record the state change
    },

    async setPrompt(prompt: string) {
      console.log('setPrompt:', prompt);
      this.prompt = prompt;
      this.recordState();
    },

    setStreamIn(isStreamIn: boolean) {
      this.isStreamIn = isStreamIn;
      this.recordState();
    },

    /* 删除当前对话组的全部内容 */
    async clearChatByGroupId() {
      if (!this.active) return;

      await fetchDelChatLogByGroupIdAPI({ groupId: this.active });
      await this.queryActiveChatLogList();
    },

    recordState() {
      setLocalState(this.$state);
    },

    clearChat() {
      this.chatList = [];
      this.groupList = [];
      this.active = 0;
      this.recordState();
    },
  },
});
