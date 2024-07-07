
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{I as t}from"./index-B-LUCRde.js";const e={queryCats:p=>t.get("app/queryAppCats",{params:p}),deleteCats:p=>t.post("app/delAppCats",p),createCats:p=>t.post("app/createAppCats",p),updateCats:p=>t.post("app/updateAppCats",p),queryApp:p=>t.get("app/queryApp",{params:p}),querySystemApp:p=>t.get("app/querySystemApp"),deleteApp:p=>t.post("app/delApp",p),createApp:p=>t.post("app/createApp",p),updateApp:p=>t.post("app/updateApp",p),updateSystemApp:p=>t.post("app/updateSystemApp",p),auditPassApp:p=>t.post("app/auditPass",p),auditFailApp:p=>t.post("app/auditFail",p)};export{e as A};
