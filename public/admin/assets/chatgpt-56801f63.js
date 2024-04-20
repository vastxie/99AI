
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * Gitee  https://gitee.com/hooray/fantastic-admin
 * Github https://github.com/hooray/fantastic-admin
 */
  
import{Y as e}from"./index-e656eb90.js";const p={queryKeyList:t=>e.get("chatgpt/keyList",{params:t}),queryKeyModelList:t=>e.get("chatgpt/keyModelList",{params:t}),queryKeyDetail:t=>e.get("chatgpt/keyDetail",{params:t}),addGptKey:t=>e.post("chatgpt/addKey",t),updateGptKey:t=>e.post("chatgpt/updateKey",t),addWhiteUser:t=>e.post("chatgpt/addWhiteUser",t),updateWhiteUser:t=>e.post("chatgpt/updateWhiteUser",t),queryWhiteUserList:t=>e.get("chatgpt/userWhiteList",{params:t}),deleteGptKey:t=>e.post("chatgpt/deleteKey",t),queryChatBoxTypes:()=>e.get("chatgpt/queryChatBoxTypes"),setChatBoxType:t=>e.post("chatgpt/setChatBoxType",t),delChatBoxType:t=>e.post("chatgpt/delChatBoxType",t),queryChatBoxs:()=>e.get("chatgpt/queryChatBoxs"),setChatBox:t=>e.post("chatgpt/setChatBox",t),delChatBox:t=>e.post("chatgpt/delChatBox",t),queryChatPreTypes:()=>e.get("chatgpt/queryChatPreTypes"),setChatPreType:t=>e.post("chatgpt/setChatPreType",t),delChatPreType:t=>e.post("chatgpt/delChatPreType",t),queryChatPres:()=>e.get("chatgpt/queryChatPres"),setChatPre:t=>e.post("chatgpt/setChatPre",t),delChatPre:t=>e.post("chatgpt/delChatPre",t)};export{p as A};
