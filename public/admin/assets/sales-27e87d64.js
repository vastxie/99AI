
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * Gitee  https://gitee.com/hooray/fantastic-admin
 * Github https://github.com/hooray/fantastic-admin
 */
  
import{Y as e}from"./index-a4526b0d.js";const a={querySalesOrder:s=>e.get("sales/salesOrder",{params:s}),salesAuditOrder:s=>e.post("sales/auditOrder",s),updateSalesUser:s=>e.post("sales/updateUserSales",s),queryRecords:s=>e.get("sales/inviteRecords",{params:s}),querySalesUserList:s=>e.get("sales/salesUserList",{params:s})};export{a as A};
