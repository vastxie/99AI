
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{I as o}from"./index-6QRvoxq4.js";const r={queryBadWords:(d={})=>o.get("badwords/query",{params:d}),queryViolation:(d={})=>o.get("badwords/violation",{params:d}),delBadWords:d=>o.post("badwords/del",d),addBadWords:d=>o.post("badwords/add",d),updateBadWords:d=>o.post("badwords/update",d)};export{r as A};
