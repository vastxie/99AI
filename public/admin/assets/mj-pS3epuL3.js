
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{I as s}from"./index-B-LUCRde.js";const t={queryAdminDrawList:e=>s.get("midjourney/adminDrawList",{params:e}),salesAuditOrder:e=>s.post("sales/auditOrder",e),updateSalesUser:e=>s.post("sales/updateUserSales",e),queryRecords:e=>s.get("sales/inviteRecords",{params:e}),querySalesUserList:e=>s.get("sales/salesUserList",{params:e}),queryPrompts:()=>s.get("midjourney/queryPrompts"),setPrompt:e=>s.post("midjourney/setPrompt",e),delPrompt:e=>s.post("midjourney/delPrompt",e)};export{t as A};
