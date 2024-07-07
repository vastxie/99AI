
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{I as t}from"./index-B-LUCRde.js";const a={queryChatAll:r=>t.get("chatLog/chatAll",{params:r}),queryDrawAll:r=>t.get("chatLog/drawAll",{params:r}),recDrawImg:r=>t.post("chatLog/recDrawImg",r),queryMjDrawAll:r=>t.get("midjourney/getList",{params:r}),recMjDrawImg:r=>t.post("midjourney/rec",r),delChatLog:r=>t.post("midjourney/del",r)};export{a as A};
