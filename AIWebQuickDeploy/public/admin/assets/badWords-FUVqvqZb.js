
/**
 * 由 Fantastic-admin 提供技术支持
 * Powered by Fantastic-admin
 * https://fantastic-admin.github.io
 */

import{ac as d}from"./index-BERX8Mlm.js";const a={queryBadWords:(a={})=>d.get("badwords/query",{params:a}),queryViolation:(a={})=>d.get("badwords/violation",{params:a}),delBadWords:a=>d.post("badwords/del",a),addBadWords:a=>d.post("badwords/add",a),updateBadWords:a=>d.post("badwords/update",a)};export{a as A};
